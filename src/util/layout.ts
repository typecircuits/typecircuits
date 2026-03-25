import * as compiler from "@/compiler";
import ELK, { type ElkExtendedEdge, type ElkPort } from "elkjs/lib/elk.bundled";

export const groupSeparation = 100;
export const nodeSeparation = 100;
export const edgeSeparation = 20;
export const nodeLabelFontSize = 14;
export const nodeLabelFontFamily = "JetBrains Mono";
export const nodePaddingX = 16;
export const nodePaddingY = 20;
export const groupLabelHeight = 24;

const elk = new ELK();

export const layout = async (
    direction: string,
    groups: compiler.Groups,
    nodes: compiler.Node[],
    edges: compiler.Edge[],
    filter: (node: compiler.Node) => boolean,
) => {
    interface GroupData {
        id: string;
        group: compiler.Group;
        children: {
            id: string;
            node: compiler.Node;
            [key: string]: unknown;
            ports?: ElkPort[];
        }[];
        [key: string]: unknown;
    }

    const fontWidth = (() => {
        const fontSizeElement = document.createElement("span");
        fontSizeElement.style.display = "none";
        fontSizeElement.style.fontFamily = nodeLabelFontFamily;
        fontSizeElement.style.fontSize = `${nodeLabelFontSize}px`;
        fontSizeElement.style.width = "1ch";
        document.body.appendChild(fontSizeElement);

        const fontWidth = parseFloat(getComputedStyle(fontSizeElement).width);

        fontSizeElement.remove();

        return fontWidth;
    })();

    const nodeIds = new Map<compiler.Node, string>();
    for (const node of nodes) {
        if (!filter(node)) {
            continue;
        }

        const id = node.id ?? `node${nodeIds.size}`;
        nodeIds.set(node, id);
    }

    const groupData = new Map<compiler.Group, GroupData>();
    for (const group of groups.all()) {
        const nodes = group.nodes.values().filter(filter).toArray();
        if (nodes.length === 0) continue;

        nodes.sort((a, b) => a.span.start.index - b.span.start.index);

        const data: GroupData = {
            id: `group${groupData.size}`,
            group,
            children: [],
        };

        groupData.set(group, data);

        for (const node of nodes) {
            const id = nodeIds.get(node);
            if (id == null) continue;

            data.children.push({
                id,
                node,
                width: fontWidth * node.span.source.length + nodePaddingX * 2,
                height: nodeLabelFontSize + nodePaddingY * 2,
            });
        }
    }

    for (const group of groupData.values()) {
        for (const node of group.children) {
            node.ports = groupData
                .values()
                .filter(({ group }) =>
                    edges.some((edge) => edge.to === node.node && group.nodes.has(edge.from)),
                )
                .map(
                    (group): ElkPort => ({
                        id: `port_${node.id}_${group.id}`,
                        layoutOptions: {
                            "elk.portAlignment.default": "CENTER",
                        },
                    }),
                )
                .toArray();
        }
    }

    const sharedLayoutOptions = {
        "elk.algorithm": "layered",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.layered.spacing.nodeNodeBetweenLayers": nodeSeparation.toString(),
        "elk.layered.mergeEdges": "true",
    };

    const edgeIds: Set<string> = new Set();
    let edgeData = edges.flatMap(({ from: source, to: target }) => {
        const sourceId = nodeIds.get(source);
        const targetId = nodeIds.get(target);
        const sourceGroup = groups.all().find((group) => group.nodes.has(source));

        if (sourceId == null || targetId == null || sourceGroup == null) {
            return [];
        }

        const sourceGroupId = groupData.get(sourceGroup)!.id;

        const id = `edge${sourceId}-${targetId}`;

        if (edgeIds.has(id)) {
            return [];
        }

        edgeIds.add(id);

        return [{ id, sources: [sourceId], targets: [`port_${targetId}_${sourceGroupId}`] }];
    });

    // Remove nodes that are not part of any group
    for (const [node, id] of nodeIds) {
        if (!groupData.values().some((g) => g.children.some((c) => c.id === id))) {
            nodeIds.delete(node);
            edgeData = edgeData.filter((edge) => edge.sources[0] !== id && edge.targets[0] !== id);
        }
    }

    const layouted = await elk.layout({
        id: "root",
        children: groupData
            .values()
            .map((group) => ({
                ...group,
                layoutOptions: { ...sharedLayoutOptions },
            }))
            .toArray(),
        edges: edgeData,
        layoutOptions: {
            ...sharedLayoutOptions,
            "elk.direction": direction,
            "elk.json.edgeCoords": "ROOT",
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.layered.considerModelOrder.strategy": "EDGES_ONLY",
            "elk.spacing.baseValue": groupSeparation.toString(),
            "elk.spacing.nodeNode": nodeSeparation.toString(),
            "elk.spacing.edgeNode": edgeSeparation.toString(),
            "elk.layered.nodePlacement.favorStraightEdges": "false",
        },
    });

    const clusters = layouted.children!.map((group) => ({
        id: group.id,
        group: group.group,
        boundingBox: {
            x: group.x!,
            y: group.y!,
            width: group.width!,
            height: group.height!,
        },
        children: group.children.map((child) => ({
            id: child.id,
            node: child.node,
            boundingBox: {
                x: (child.x as number) + group.x!,
                y: (child.y as number) + group.y!,
                width: child.width!,
                height: child.height!,
            },
        })),
    }));

    const edgeCoordinates = (source: compiler.Node, target: compiler.Node) =>
        layouted.edges!.find(
            (edge) =>
                edge.sources![0] === nodeIds.get(source)! &&
                edge.targets![0].startsWith(`port_${nodeIds.get(target)!}`),
        ) as ElkExtendedEdge | undefined;

    return { nodeIds, clusters, edgeCoordinates };
};
