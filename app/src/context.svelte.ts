import * as core from "core";
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
    hideLogo: false,
    project: undefined as "code" | "visualization" | undefined,
    preview: false,
    code: "",
    errorMessage: "",
    selections: [] as [number, number][],
    hiddenNodes: [] as string[],
    show: defaultShow,
    language: undefined as core.Language<any> | undefined,
    visualizer: undefined as string | undefined,
    compileResult: undefined as core.CompileResult | undefined,
    printing: undefined as PrintOptions | undefined,
});

export const getFilter = () => selectionFilter(context.selections, context.hiddenNodes);

export const getFilteredNodes = () =>
    context.compileResult?.displayNodes.values().filter(getFilter()).toArray();
