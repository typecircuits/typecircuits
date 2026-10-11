import type { Component } from "svelte";
import * as core from "core";
import CircuitVisualizer from "./circuit/CircuitVisualizer.svelte";
import AstVisualizer from "./ast/AstVisualizer.svelte";
import type { Show } from "@/App.svelte";

export interface VisualizerProps {
    compileResult: core.CompileResult | undefined;
    show: Show;
    preview?: boolean;
    embed?: boolean;
    selections?: [number, number][];
    hiddenNodes?: string[];
    selectedGroup?: core.CompiledGroup;
}

export interface VisualizerBindings<T extends Record<string, any>> {
    toolbarProps?: T;
    toolbar?: Component<T>;
}

export const allVisualizers: Record<string, Component<VisualizerProps, VisualizerBindings<any>>> = {
    Circuit: CircuitVisualizer,
    AST: AstVisualizer,
};
