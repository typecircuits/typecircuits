import { test } from "vitest";
import { javascriptLanguage } from "./javascript";
import { run } from "../util.test";

test("TODO", async () => {
    await run(javascriptLanguage, "const x = 123;");
});
