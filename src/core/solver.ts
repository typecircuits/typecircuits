import { Node } from "./compiler";

export type Type = Node | ConcreteType;

export abstract class ConcreteType {
    kind?: string;
    children: Type[];

    constructor(children: Type[] = []) {
        this.children = children;
    }

    abstract render(children: ((root: boolean) => string)[], root: boolean): string;
}

export const concreteTypesAreEqual = (left: Type, right: Type): boolean => {
    if (!(left instanceof ConcreteType) || !(right instanceof ConcreteType)) {
        return true;
    }

    if (left.constructor !== right.constructor || left.children.length !== right.children.length) {
        return false;
    }

    for (let i = 0; i < left.children.length; i++) {
        if (!concreteTypesAreEqual(left.children[i], right.children[i])) {
            return false;
        }
    }

    return true;
};

export interface Group {
    nodes: Node[];
    types: ConcreteType[];
}

export interface SolverOptions {
    onUpdate?: (event: SolverEvent) => void;
}

export interface Solver {
    options: SolverOptions;
    readonly nodes: Node[];
    readonly groups: Group[];
    reset: () => void;
    unifyAt: (representative: Node, types: [Type, Type]) => void;
    overloadAt: (representative: Node, overloads: [Type, Type][][]) => void;
    step: () => boolean;
    run: () => void;
    renderType: (type: Type) => string;
}

export type SolverEvent = UnifyEvent | OverloadEvent;

export interface UnifyEvent {
    type: "unify";
    representative: Node;
    left: Type;
    right: Type;
}

export interface OverloadEvent {
    type: "overload";
    representative: Node;
    overloads: [Type, Type][][];
}

export const makeSolver = (): Solver => {
    const options: SolverOptions = {};
    let groups: (Group | undefined)[] = [];
    let unifyQueue: UnifyEvent[] = [];
    let overloadQueue: OverloadEvent[] = [];
    let shouldUpdate = false;

    const makeGroup = (nodes: Node[], types: ConcreteType[]): Group => ({ nodes, types });

    const insertNode = (group: Group, node: Node) => {
        if (!group.nodes.includes(node)) {
            group.nodes.push(node);
        }
    };

    const insertType = (group: Group, type: ConcreteType) => {
        if (group.types.every((existing) => !concreteTypesAreEqual(existing, type))) {
            group.types.push(type);
        }

        // Register nodes referenced by the type
        for (const child of type.children) {
            if (child instanceof Node) {
                unify(child, child);
            }
        }
    };

    const groupIndexOf = (node: Node) =>
        groups.findIndex((group) => group != null && group.nodes.includes(node));

    const insertGroup = (group: Group) => {
        const index = groups.findIndex((group) => group == null);

        if (index !== -1) {
            groups[index] = group;
        } else {
            groups.push(group);
        }
    };

    const removeGroup = (index: number) => {
        const group = groups[index]!;
        groups[index] = undefined;
        return group;
    };

    const unify = (left: Type, right: Type): boolean => {
        const leftNode = left instanceof Node ? left : undefined;
        const rightNode = right instanceof Node ? right : undefined;

        if (leftNode != null && rightNode != null && leftNode !== rightNode) {
            group(leftNode, rightNode);
        }

        left = applyShallow(left);
        right = applyShallow(right);

        if (left === right) {
            return true;
        }

        if (left instanceof ConcreteType && right instanceof ConcreteType) {
            if (left.constructor === right.constructor) {
                for (let i = 0; i < Math.min(left.children.length, right.children.length); i++) {
                    unify(left.children[i], right.children[i]);
                }
            }

            if (
                left.constructor !== right.constructor ||
                left.children.length !== right.children.length
            ) {
                if (leftNode != null) {
                    type(leftNode, left);
                    type(leftNode, right);
                }

                if (rightNode != null) {
                    type(rightNode, left);
                    type(rightNode, right);
                }

                return false;
            }
        } else if (left instanceof ConcreteType && right instanceof Node) {
            type(right, left);
        } else if (left instanceof Node && right instanceof ConcreteType) {
            type(left, right);
        }

        return true;
    };

    const group = (leftNode: Node, rightNode: Node) => {
        const leftIndex = groupIndexOf(leftNode);
        const rightIndex = groupIndexOf(rightNode);

        if ((leftIndex !== -1 || rightIndex !== -1) && leftIndex === rightIndex) {
            return; // already the same group
        }

        if (leftIndex !== -1 && rightIndex !== -1) {
            const leftGroup = removeGroup(leftIndex)!;
            const rightGroup = removeGroup(rightIndex)!;

            for (const node of rightGroup.nodes) {
                insertNode(leftGroup, node);
            }

            insertGroup(leftGroup);

            for (const type of rightGroup.types) {
                unify(leftNode, type);
            }
        } else if (leftIndex !== -1 && rightIndex === -1) {
            const group = removeGroup(leftIndex)!;
            insertNode(group, rightNode);
            insertGroup(group);
        } else if (leftIndex === -1 && rightIndex !== -1) {
            const group = removeGroup(rightIndex)!;
            insertNode(group, leftNode);
            insertGroup(group);
        } else {
            const nodes = leftNode === rightNode ? [leftNode] : [leftNode, rightNode];
            const group = makeGroup(nodes, []);
            insertGroup(group);
        }

        shouldUpdate = true;
    };

    const type = (node: Node, type: ConcreteType) => {
        let index = groupIndexOf(node);
        const group = index !== -1 ? removeGroup(index) : makeGroup([node], []);
        insertType(group, type);
        insertGroup(group);
    };

    const step = () => {
        const event = unifyQueue.shift() ?? overloadQueue.shift();
        if (event == null) {
            return false;
        }

        shouldUpdate = false;

        switch (event.type) {
            case "unify": {
                unify(event.left, event.right);
                break;
            }
            case "overload": {
                if (event.overloads.length === 1) {
                    const [constraints] = event.overloads;
                    for (const [left, right] of constraints) {
                        unify(left, right);
                    }

                    break;
                }

                // First resolve each overload on a copy to avoid interfering with
                // existing types if it doesn't unify
                let candidate: [Type, Type][] | undefined;
                overloads: for (const constraints of event.overloads) {
                    for (const [left, right] of constraints) {
                        if (!concreteTypesAreEqual(apply(left), apply(right))) {
                            continue overloads;
                        }
                    }

                    // Found a matching overload, stop searching
                    candidate = constraints;
                    break overloads;
                }

                // Use the first overload as a fallback
                if (candidate == undefined) {
                    candidate = event.overloads[0];
                }

                for (const [left, right] of candidate) {
                    unify(left, right);
                }

                break;
            }
            default: {
                event satisfies never;
            }
        }

        if (shouldUpdate) {
            options.onUpdate?.(event);
        }

        return true;
    };

    const applyShallow = (type: Type): Type => {
        if (type instanceof Node) {
            const groupIndex = groupIndexOf(type);
            if (groupIndex === -1) {
                return type;
            }

            const group = groups[groupIndex]!;

            if (group.types.length === 0) {
                return type;
            }

            [type] = group.types;
        }

        return type;
    };

    const apply = (type: Type): Type => {
        type = applyShallow(type);

        if (type instanceof Node) {
            return type;
        }

        const applied: ConcreteType = Object.create(type.constructor.prototype);
        applied.constructor = type.constructor;
        applied.kind = type.kind;
        applied.children = type.children.map((child) => apply(child));
        applied.render = type.render;

        return applied;
    };

    const renderType = (type: Type, root = true): string => {
        type = apply(type);

        if (type instanceof Node) {
            return "_";
        } else {
            const children = type.children.map(
                (child) => (root: boolean) => renderType(child, root),
            );

            return type.render(children, root);
        }
    };

    return {
        options,
        get nodes() {
            return groups.flatMap((group) => (group != null ? group.nodes : []));
        },
        get groups() {
            return groups.filter((group) => group != null);
        },
        unifyAt: (representative, [left, right]) => {
            unifyQueue.push({ type: "unify", representative, left, right });
        },
        overloadAt: (representative, overloads) => {
            overloadQueue.push({ type: "overload", representative, overloads });
        },
        step,
        run: () => {
            while (step()) {}
        },
        reset: () => {
            groups = [];
            unifyQueue = [];
            overloadQueue = [];
        },
        renderType,
    };
};
