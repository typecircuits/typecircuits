import type { Component } from "svelte";
import * as compiler from "@/core/compiler";
import CircuitVisualizer from "./circuit/CircuitVisualizer.svelte";
import AstVisualizer from "./ast/AstVisualizer.svelte";
import type { Show } from "@/App.svelte";

export interface VisualizerProps {
    compileResult: compiler.CompileResult | undefined;
    preview: boolean | undefined;
    show: Show;
    selections: [number, number][] | undefined;
    hiddenNodes: string[] | undefined;
    selectedGroup: compiler.CompiledGroup | undefined;
}

export interface VisualizerBindings<T extends Record<string, any>> {
    toolbarProps?: T;
    toolbar?: Component<T>;
}

export const allVisualizers: Record<string, Component<VisualizerProps, VisualizerBindings<any>>> = {
    Circuit: CircuitVisualizer,
    AST: AstVisualizer,
};
