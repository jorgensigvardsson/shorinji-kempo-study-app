#!/usr/bin/env python3
"""Send a plain-text alert email over SMTP using stdlib only.

Reuses the same SMTP repository configuration the backend deploys with
(SMTP_HOST/PORT/USERNAME/PASSWORD/FROM/TLS), so alerting needs no new
credentials and no third-party action.

Reads the message from the environment:
    ALERT_TO       comma-separated recipients
    ALERT_SUBJECT  subject line
    ALERT_BODY     plain-text body

If SMTP or the recipient list isn't configured this prints a GitHub warning
annotation and exits 0. It is called from a step that only runs when something
has *already* failed; exiting non-zero here would replace a real, explained
failure with a confusing one. The missing-configuration warning is also emitted
on healthy runs (see the preflight step in renew-certs.yml), so a silently
unreachable mailbox doesn't go unnoticed until the day it matters.
"""

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def warn(text: str) -> None:
    print(f"::warning::{text}")


def main() -> int:
    host = os.environ.get("SMTP_HOST", "").strip()
    recipients = [a.strip() for a in os.environ.get("ALERT_TO", "").split(",") if a.strip()]
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USERNAME", "").strip()

    if not host or not recipients or not sender:
        warn(
            "Certificate alert email not sent: SMTP_HOST, SMTP_FROM and "
            "CERT_ALERT_EMAIL/ACME_CONTACT_EMAIL must all be configured. "
            "See BACKEND.md."
        )
        return 0

    port = int(os.environ.get("SMTP_PORT", "") or 587)
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    mode = (os.environ.get("SMTP_TLS", "") or "starttls").strip().lower()

    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message["Subject"] = os.environ.get("ALERT_SUBJECT", "Certificate renewal alert")
    message.set_content(os.environ.get("ALERT_BODY", ""))

    try:
        if mode in ("tls", "ssl", "smtps"):
            server = smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=30)
        else:
            server = smtplib.SMTP(host, port, timeout=30)
        with server:
            server.ehlo()
            if mode == "starttls":
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username:
                server.login(username, password)
            server.send_message(message)
    except Exception as exc:  # noqa: BLE001 — never mask the failure being reported
        warn(f"Certificate alert email could not be sent ({type(exc).__name__}: {exc}).")
        return 0

    print(f"Alert email sent to {', '.join(recipients)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
