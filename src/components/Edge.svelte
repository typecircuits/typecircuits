<script lang="ts">
    import type * as compiler from "@/compiler";
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

    const { label } = props.label as any as compiler.Edge;
    const { color, target, options } = props.data as any;

    const isActive = $derived(
        activeNodes.current.length === 0 || activeNodes.current.includes(target),
    );

    const opacity = $derived(isActive ? 1 : 0.05);

    const showGroups = $derived(options.showGroups);

    const strokeColor = $derived(showGroups ? color : "gray");
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
            "rounded-[12px] border-1 border-gray-200 bg-white px-[4px] py-[1px] text-[smaller] transition-opacity duration-75",
            isActive ? "opacity-100" : "opacity-0",
        ]}
    >
        {label}
    </div>
</EdgeLabel>
