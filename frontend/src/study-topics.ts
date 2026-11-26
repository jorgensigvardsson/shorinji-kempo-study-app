export const deepeningPath = "/theory/deepening";

export const studyTopics = [
    {
        key: "movements",
        title: "Positioner och rörelser",
        description: "Hur ställningar, förflyttningar, angrepp och försvar delas in och benämns.",
        path: `${deepeningPath}/movements`,
    },
    {
        key: "groups",
        title: "Teknikgrupper",
        description: "Hokei samlade efter teknikgrupp.",
        // Keep existing bookmarks and pinned shortcuts pointing at the same page.
        path: "/theory/groups",
    },
    {
        key: "language",
        title: "Japanska och träningsspråk",
        description: "Uttal, räkning, kommandon och uttryck från träningen.",
        path: `${deepeningPath}/language`,
    },
    {
        key: "ranks",
        title: "Grader, roller och titlar",
        description: "Gradsystemen och benämningar på roller och uppdrag.",
        path: `${deepeningPath}/ranks`,
    },
    {
        key: "etiquette",
        title: "Etikett och träningsrutiner",
        description: "Hälsningar, uppförande, klädsel och rutiner i dojon.",
        path: `${deepeningPath}/etiquette`,
    },
    {
        key: "philosophy",
        title: "Filosofi och texter",
        description: "Talesätt, grundtankar och benämningar på gemensamma texter.",
        path: `${deepeningPath}/philosophy`,
    },
] as const;

export type StudyTopicKey = typeof studyTopics[number]["key"];
export type ReadingTopicKey = Exclude<StudyTopicKey, "groups">;
export const studyTopicFor = (key: string | undefined) => studyTopics.find(topic => topic.key === key);
