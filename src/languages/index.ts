import { customLanguage } from "@/compiler";
import { javascript } from "./javascript";
import { python } from "./python";
import { java } from "./java";
import { csharp } from "./csharp";
import { kotlin } from "./kotlin";
import { embed, type EmbedOptions } from "@/compiler/features/embed";

export const languages = [javascript, python, java, csharp, kotlin];

export const embeddedLanguage = (name: string, options: EmbedOptions) =>
    customLanguage({
        name,
        features: [embed(options)],
    });
