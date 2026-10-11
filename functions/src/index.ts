import { z } from "zod";
import * as core from "core";

const RequestBody = z.object({
    code: z.string(),
    language: z.string(),
});

export default async (request: Request) => {
    const body = RequestBody.parse(await request.json());

    const language = core.getLanguage(body.language);
    if (language == null) {
        return new Response(`unknown language '${body.language}'`, { status: 400 });
    }

    let compileResult: core.CompileResult | undefined;
    const parsed = await language.parse(body.code);
    if (parsed != null) {
        const compiler = core.makeCompiler({});
        await language.compile(parsed, compiler);
        compileResult = compiler.finish();
    }

    let response: Record<string, unknown> = {};
    if (compileResult != null) {
        response.nodes = compileResult.displayNodes.map((node) => node.toString()) ?? [];

        response.edges = compileResult.edges
            .filter(
                (edge) =>
                    compileResult.displayNodes.includes(edge.from) &&
                    compileResult.displayNodes.includes(edge.to),
            )
            .map(({ from, to, label }) => ({
                from: from.toString(),
                to: to.toString(),
                label: label,
            }));

        response.groups = compileResult.groups
            .filter((group) => group.displayNodes.length > 0)
            .map((group) => ({
                nodes: group.displayNodes.map((node) => compileResult.displayNodes.indexOf(node)),
                types: group.types,
                conflict: group.conflict,
            }));
    }

    return new Response(JSON.stringify(response), {
        headers: {
            "Content-Type": "application/json",
        },
    });
};
