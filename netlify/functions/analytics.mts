/// <reference lib="esnext" />

import type { Context } from "@netlify/functions";
import { z } from "zod";
import { MongoClient } from "mongodb";

const db = process.env.MONGODB_URL
    ? new MongoClient(process.env.MONGODB_URL).db("analytics")
    : undefined;

const response = (status: number, body: string | null) => {
    const response = new Response(body, { status });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
};

export default async (req: Request, context: Context) => {
    if (req.method === "OPTIONS") {
        return response(204, null);
    }

    const json = await req.json();

    const result = z
        .object({
            sessionId: z.string(),
            participantId: z.string().nullish(),
            event: analyticsEvent,
        })
        .safeParse(json);

    if (!result.success) {
        return response(400, "Invalid request");
    }

    const { sessionId, participantId, event } = result.data;

    context.waitUntil(record(sessionId, participantId, event));

    return response(204, null);
};

const analyticsEvent = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("sessionstart"),
    }),
    z.object({
        type: z.literal("sessionend"),
    }),
    z.object({
        type: z.literal("code"),
        language: z.string(),
        code: z.string(),
        selections: z.array(z.tuple([z.number(), z.number()])),
    }),
    z.object({
        type: z.literal("save"),
    }),
    z.object({
        type: z.literal("print"),
    }),
    z.object({
        type: z.literal("project"),
    }),
    z.object({
        type: z.literal("example"),
        example: z.string(),
    }),
]);

type AnalyticsEvent = z.infer<typeof analyticsEvent>;

const record = async (
    sessionId: string,
    participantId: string | undefined,
    event: AnalyticsEvent,
) => {
    if (db == null) {
        console.info("event:", { sessionId, participantId, event });
        return;
    }

    db.collection("events").insertOne({
        date: new Date(),
        session: sessionId,
        participant: participantId ?? null,
        event,
    });
};
