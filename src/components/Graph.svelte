<script module lang="ts">
    // From coolors.co
    export const colors = ["#277da1", "#43aa8b", "#90be6d", "#f9c74f", "#f8961e", "#ff758f"];

    export const activeNodes = $state({ current: [] as compiler.Node[] });
</script>

<script lang="ts">
    import {
        Background,
        ControlButton,
        Controls,
        MarkerType,
        SvelteFlow,
        useSvelteFlow,
    } from "@xyflow/svelte";
    import Group from "./Group.svelte";
    import Node from "./Node.svelte";
    import Edge from "./Edge.svelte";
    import { groupLabelHeight, layout } from "@/util/layout";
    import Icon from "./Icon.svelte";
    import { debounce } from "@/util/debounce";
    import type * as compiler from "@/compiler";
    import { displayType } from "@/compiler/solver/type";
    import type { Show } from "@/App.svelte";

    interface Props {
        context: ReturnType<typeof useSvelteFlow>;
        preview?: boolean;
        selectedGroup: compiler.Group | undefined;
        filter: (node: compiler.Node) => boolean;
        show: Show;
        compileResult: compiler.CompileResult;
    }

    let {
        context = $bindable(),
        preview,
        selectedGroup = $bindable(),
        filter,
        show,
        compileResult,
    }: Props = $props();

    let direction = $state<"RIGHT" | "DOWN">("RIGHT");
    const toggleDirection = () => {
        direction = direction == "DOWN" ? "RIGHT" : "DOWN";
    };

    const sharedProps = {
        selectable: false,
        draggable: false,
    };

    const { fitView } = useSvelteFlow();

    const getLayouted = async () => {
        try {
            const { clusters, nodeIds, edgeCoordinates } = await layout(
                direction,
                compileResult,
                filter,
            );

            requestAnimationFrame(() => {
                fitView();
            });

            const groupColors = new Map<compiler.Group, string>();
            const groupColor = (group: compiler.Group) => {
                if (group.types.length === 0) {
                    return "var(--color-gray-500)";
                }

                if (!groupColors.has(group)) {
                    groupColors.set(group, colors[groupColors.size % colors.length]);
                }

                return groupColors.get(group)!;
            };

            return {
                nodes: clusters.flatMap(({ id, group, boundingBox, children }) => {
                    const groupNode = {
                        ...sharedProps,
                        id,
                        type: "Group",
                        data: {
                            color: groupColor(group),
                            nodes: children.map(({ node }) => node),
                            labels: group.types.map((type) => displayType(type)),
                            conflict: group.conflict,
                            show,
                            onmouseenter: () => {
                                selectedGroup = group;
                            },
                            onmouseleave: () => {
                                selectedGroup = undefined;
                            },
                        },
                        position: {
                            x: boundingBox.x,
                            y: boundingBox.y - groupLabelHeight,
                        },
                        width: boundingBox.width,
                        height: boundingBox.height,
                        zIndex: 0,
                    };

                    const childNodes = children.map(({ id, node, boundingBox }) => ({
                        ...sharedProps,
                        id,
                        type: "Node",
                        data: {
                            node,
                            show,
                            setActive: (active: boolean) => {
                                if (active) {
                                    const nodes = new Set<compiler.Node>([node]);
                                    while (true) {
                                        let progress = false;

                                        for (const edge of compileResult.edges) {
                                            if (nodes.has(edge.to) && !nodes.has(edge.from)) {
                                                nodes.add(edge.from);
                                                progress = true;
                                            }
                                        }

                                        if (!progress) {
                                            break;
                                        }
                                    }

                                    activeNodes.current = Array.from(nodes);
                                } else {
                                    activeNodes.current = [];
                                }
                            },
                        },
                        position: {
                            x: boundingBox.x,
                            y: boundingBox.y,
                        },
                        width: boundingBox.width,
                        height: boundingBox.height,
                        zIndex: 1,
                    }));

                    return [groupNode, ...childNodes];
                }),

                edges: compileResult.edges.flatMap((edge) => {
                    const { from: source, to: target } = edge;

                    const sourceId = nodeIds.get(source)!;
                    const targetId = nodeIds.get(target)!;
                    const targetGroup = compileResult.groups.find((group) =>
                        group.nodes.has(target),
                    );

                    if (targetGroup == null) {
                        console.warn("Missing target group for node:", target);
                        return [];
                    }

                    const id = `edge-${sourceId}-${targetId}`;

                    const coordinates = edgeCoordinates(source, target);
                    if (coordinates == null) {
                        return [];
                    }

                    return [
                        {
                            ...sharedProps,
                            id,
                            type: "Edge",
                            source: sourceId,
                            target: targetId,
                            label: edge,
                            zIndex: 2,
                            markerEnd: { type: MarkerType.ArrowClosed },
                            data: {
                                source,
                                target,
                                sections: coordinates.sections,
                                color: groupColor(targetGroup),
                                show,
                            },
                        },
                    ];
                }),
            };
        } catch (e) {
            console.error(e);
            return { nodes: [], edges: [] };
        }
    };

    let layouted = $state<Awaited<ReturnType<typeof getLayouted>>>({ nodes: [], edges: [] });

    const updateLayout = async () => {
        layouted = await getLayouted();
    };

    $effect(() => {
        updateLayout();

        window.addEventListener("resize", updateLayout);

        return () => {
            window.removeEventListener("resize", updateLayout);
        };
    });

    const svelteFlowContext = useSvelteFlow();
    $effect(() => {
        context = svelteFlowContext;
    });
</script>

<div class="flex-1 shrink-0" style:--background-color="transparent">
    <SvelteFlow
        inert={preview}
        nodeTypes={{ Group, Node } as any}
        edgeTypes={{ Edge } as any}
        edges={layouted.edges as any}
        nodes={layouted.nodes as any}
        nodesFocusable={false}
        onnodepointerenter={({ node }) => {
            (node.data.onmouseenter as any)?.();
        }}
        onnodepointerleave={({ node, event }) => {
            if ("onmouseleave" in node.data) {
                // Ignore mouseleave events when hovering over nodes inside the group
                const rect = (event.target as HTMLElement).getBoundingClientRect();
                if (
                    event.clientX >= rect.left &&
                    event.clientX <= rect.right &&
                    event.clientY >= rect.top &&
                    event.clientY <= rect.bottom
                ) {
                    return;
                }

                (node.data.onmouseleave as any)();
            }
        }}
        minZoom={0.25}
        maxZoom={5}
        fitView
        proOptions={{ hideAttribution: true }}
    >
        {#if !preview}
            <Controls
                showLock={false}
                orientation="horizontal"
                class="*:ring-r-[1.5px]! *:ring-r-black/5! m-[10px]! overflow-clip rounded-lg border-[1.5px] border-black/5 bg-white shadow-lg! shadow-black/2.5! *:size-[32px]!"
            >
                <ControlButton onclick={toggleDirection} class="">
                    <div
                        class="flex items-center justify-center text-sm"
                        style:transform={direction === "DOWN" ? "rotate(90deg)" : ""}
                    >
                        <Icon>sync_alt</Icon>
                    </div>
                </ControlButton>
            </Controls>

            <Background patternColor="var(--color-gray-300)" />
        {/if}
    </SvelteFlow>
</div>
