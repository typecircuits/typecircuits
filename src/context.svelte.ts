import * as compiler from "@/core/compiler";
import type { Language } from "@/core/languages";
import { selectionFilter } from "./App.svelte";
import type { PrintOptions } from "./components/PrintView.svelte";

export type Show = typeof defaultShow;

export const defaultShow = {
    groups: true,
    types: true,
    functions: false,
};

export const context = $state({
    embed: false,
    fullscreen: false,
    preview: false,
    code: "",
    errorMessage: "",
    selections: [] as [number, number][],
    hiddenNodes: [] as string[],
    show: defaultShow,
    language: undefined as Language<any> | undefined,
    visualizer: undefined as string | undefined,
    compileResult: undefined as compiler.CompileResult | undefined,
    printing: undefined as PrintOptions | undefined,
});

export const getFilter = () => selectionFilter(context.selections, context.hiddenNodes);

export const getFilteredNodes = () =>
    context.compileResult?.nodes.values().filter(getFilter()).toArray();
