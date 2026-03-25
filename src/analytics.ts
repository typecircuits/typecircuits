const sessionId = crypto.randomUUID();

const analyticsUrl: string | undefined = import.meta.env.VITE_ANALYTICS_URL;

export const sendEvent = (participantId: string | null, event: Record<string, any>) => {
    if (analyticsUrl == null) return;

    // Remove to enable analytics for non-participants
    if (participantId == null) return;

    navigator.sendBeacon(
        analyticsUrl,
        JSON.stringify({
            sessionId,
            participantId,
            event,
        }),
    );
};
