<script lang="ts">
    import * as compiler from "@/compiler";
    import { pathFromPoints } from "@/util/path";
    import { BaseEdge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";
    import type { ElkEdgeSection } from "elkjs/lib/elk-api";
    import { activeNodes } from "./Graph.svelte";

    const props: EdgeProps = $props();

    const section = $derived((props.data as any).sections[0] as ElkEdgeSection);
    const points = $derived([section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);

    const [labelX, labelY] = $derived.by(() => {
        const prevPoint = points[Math.floor(points.length / 2) - 1];
        const midPoint = points[Math.floor(points.length / 2)];
        return [(prevPoint.x + midPoint.x) / 2, (prevPoint.y + midPoint.y) / 2];
    });

    const path = $derived(pathFromPoints(points));

    const { label, description, example } = props.label as any as compiler.Edge;
    const { color, source, target, options } = props.data as any;

    const isActive = $derived(
        activeNodes.current.length === 0 || activeNodes.current.includes(target),
    );

    const opacity = $derived(isActive ? 1 : 0.05);

    const showGroups = $derived(options.showGroups);

    const strokeColor = $derived(showGroups ? color : "gray");

    let expanded = $state(false);

    const onmouseenter = () => {
        expanded = true;
    };

    const onmouseleave = () => {
        expanded = false;
    };
</script>

<BaseEdge
    {path}
    markerEnd={props.markerEnd}
    class="transition-opacity duration-75"
    style="stroke-width: 2px; stroke: color-mix(in srgb, {strokeColor} 80%, white); opacity: {opacity};"
/>

<EdgeLabel x={labelX} y={labelY} style="background: none;">
    <div
        role="tooltip"
        class={[
            "rounded-[12px] border-1 border-gray-200 bg-white transition-opacity duration-75",
            expanded
                ? "px-[8px] py-[4px] shadow-md shadow-black/2.5"
                : "px-[4px] py-[1px] text-[smaller]",
            isActive ? "opacity-100" : "opacity-0",
        ]}
        {onmouseenter}
        {onmouseleave}
    >
        {#if expanded}
            <div class="flex max-w-[200px] flex-col gap-[2px] py-[4px] text-left">
                <p class="font-semibold">{label}</p>
                {#if description}
                    <p>{description}</p>
                {/if}
                {#if example}
                    <code
                        >{example[0]}<span class="bg-blue-50 font-semibold text-blue-500"
                            >{example[1]}</span
                        >{example[2]}</code
                    >
                {/if}
            </div>
        {:else}
            {label}
        {/if}
    </div>
</EdgeLabel>
