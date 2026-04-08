import javascriptCompiler from "./javascript";
import pythonCompiler from "./python";
import javaCompiler from "./java";
import csharpCompiler from "./csharp";
import type { Compiler } from "@/compiler";

interface Language {
    compiler: () => Promise<Compiler>;
    options: Record<string, boolean>;
}

const languages: Record<string, Language> = {
    JavaScript: {
        compiler: javascriptCompiler,
        options: {},
    },
    Python: {
        compiler: pythonCompiler,
        options: {},
    },
    Java: {
        compiler: javaCompiler,
        options: {
            showTypes: true,
        },
    },
    "C#": {
        compiler: csharpCompiler,
        options: {
            showTypes: true,
        },
    },
};

export default languages;
