#!/usr/bin/env python3
"""Send a plain-text alert email over SMTP using stdlib only.

Reuses the same SMTP repository configuration the backend deploys with
(SMTP_HOST/PORT/USERNAME/PASSWORD/FROM/TLS), so alerting needs no new
credentials and no third-party action.

Reads the message from the environment:
    ALERT_TO       comma-separated recipients
    ALERT_SUBJECT  subject line
    ALERT_BODY     plain-text body

If the message can't be sent this prints a GitHub warning annotation and exits
0, because it is normally called from a step that only runs when something has
*already* failed; exiting non-zero there would replace a real, explained
failure with a confusing one.

    ALERT_STRICT=true  exit 1 instead, for the test_alert dispatch whose entire
                       purpose is to find out whether the mail arrives — a
                       green run that sent nothing is the one outcome that
                       test must never produce.
"""

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


IMPLICIT = "implicit"
STARTTLS = "starttls"
NONE = "none"

# The names the deploy pipeline actually feeds in (see BACKEND.md's SMTP table)
# are starttls / implicit / none — the same vocabulary the Go mailer takes.
# The rest are tolerated synonyms so a reasonable guess in the repo variable
# does not silently become plaintext.
TLS_MODES = {
    "starttls": STARTTLS, "explicit": STARTTLS, "tls": STARTTLS,
    "implicit": IMPLICIT, "smtps": IMPLICIT, "ssl": IMPLICIT,
    "none": NONE, "off": NONE, "disabled": NONE, "": STARTTLS,
}


def warn(text: str) -> None:
    print(f"::warning::{text}")


def resolve_tls_mode(raw: str, port: int) -> str:
    """Map SMTP_TLS onto one of implicit/starttls/none.

    An unrecognised value must never quietly mean "plaintext": speaking plain
    SMTP at an implicit-TLS port doesn't fail fast, it hangs until the socket
    times out. Fall back on what the port implies and say so.
    """
    mode = TLS_MODES.get(raw.strip().lower())
    if mode is None:
        mode = IMPLICIT if port == 465 else STARTTLS
        warn(f"SMTP_TLS={raw!r} is not a recognised mode; assuming {mode} from port {port}.")
    return mode


def main() -> int:
    strict = os.environ.get("ALERT_STRICT", "").strip().lower() == "true"
    host = os.environ.get("SMTP_HOST", "").strip()
    recipients = [a.strip() for a in os.environ.get("ALERT_TO", "").split(",") if a.strip()]
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USERNAME", "").strip()

    if not host or not recipients or not sender:
        warn(
            "Certificate alert email not sent: SMTP_HOST, SMTP_FROM and "
            "CERT_ALERT_EMAIL/ACME_CONTACT_EMAIL must all be configured. "
            "See BACKEND.md."
        )
        return 1 if strict else 0

    port = int(os.environ.get("SMTP_PORT", "") or 587)
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    mode = resolve_tls_mode(os.environ.get("SMTP_TLS", ""), port)

    # Relays routinely reject the bare hostname a client would otherwise offer
    # in EHLO — the Go mailer in backend/auth/internal/email hit exactly this
    # and announces the sender's domain instead. Same relay, same fix.
    helo_name = sender.rpartition("@")[2].strip(">").strip() or None

    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message["Subject"] = os.environ.get("ALERT_SUBJECT", "Certificate renewal alert")
    message.set_content(os.environ.get("ALERT_BODY", ""))

    try:
        if mode == IMPLICIT:
            server = smtplib.SMTP_SSL(
                host, port, context=ssl.create_default_context(),
                timeout=30, local_hostname=helo_name,
            )
        else:
            server = smtplib.SMTP(host, port, timeout=30, local_hostname=helo_name)
        with server:
            server.ehlo()
            if mode == STARTTLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username:
                server.login(username, password)
            server.send_message(message)
    except Exception as exc:  # noqa: BLE001 — never mask the failure being reported
        # Name the connection settings: the first version of this script spoke
        # plaintext to an implicit-TLS port and the only clue was a bare
        # 30-second timeout.
        warn(
            f"Certificate alert email could not be sent to {host}:{port} "
            f"(TLS mode {mode}) — {type(exc).__name__}: {exc}."
        )
        return 1 if strict else 0

    print(f"Alert email sent to {', '.join(recipients)} via {host}:{port} (TLS mode {mode}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
