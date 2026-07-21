import { Context, Node } from "../index";
import { List as ImmutableList } from "immutable";
import { traverseType, typeReferencesNode, typesAreEqual, type Type } from "./type";
import { UnionFind } from "./union-find";

export class Solver {
    private unionFind = new UnionFind();
    private groups = ImmutableList<[Node, ImmutableList<Type>]>();
    private error = false;
    private temporaries = new Set<Node>();

    constructor(private context: Context) {}

    run() {
        if (this.context == null) {
            return new Groups(new Map());
        }

        this.runTypeConstraints();
        this.runOverloadConstraints();
        return this.toGroups();
    }

    private temporary() {
        const node = this.context.temporary();
        this.temporaries.add(node);
        return node;
    }

    private prepareTypeInConstraint(type: Type) {
        // Replace `null` placeholders with temporaries
        return traverseType(type, (type) => (type == null ? this.temporary() : type)) as Type;
    }

    private runTypeConstraints() {
        while (this.context.groups.length > 0) {
            const [representative, ...others] = this.context.groups.shift()!;

            for (const other of others) {
                this.unify(representative, other);
            }
        }

        while (this.context.types.length > 0) {
            let [node, type] = this.context.types.shift()!;
            this.unify(node, this.prepareTypeInConstraint(type));
        }
    }

    private runOverloadConstraints() {
        while (this.context.overloads.length > 0) {
            const overloads = this.context.overloads
                .shift()!
                .map((overload) =>
                    overload.map(([node, type]): [Node, Type] => [
                        node,
                        this.prepareTypeInConstraint(type),
                    ]),
                );

            if (overloads.length === 1) {
                const [constraints] = overloads;
                for (const [node, type] of constraints) {
                    this.unify(node, type);
                }

                continue;
            }

            // First resolve each overload on a copy to avoid interfering with
            // existing types if it doesn't unify
            let candidate: [Node, Type][] | undefined;
            overloads: for (const constraints of overloads) {
                const copy = new Solver(this.context);
                copy.unionFind = new UnionFind(this.unionFind);
                copy.groups = ImmutableList(this.groups);
                copy.error = false;

                for (const [node, type] of constraints) {
                    copy.unify(node, type);
                    if (copy.error) {
                        continue overloads;
                    }
                }

                // Found a matching overload, stop searching
                candidate = constraints;
                break overloads;
            }

            // Use the first overload as a fallback
            if (candidate == undefined) {
                candidate = overloads[0];
            }

            for (const [node, type] of candidate) {
                this.unify(node, type);
            }
        }
    }

    private toGroups(): Groups {
        const groups = new Map<Node, Group>();
        for (const [representative, types] of this.groups) {
            const group: Group = {
                nodes: new Set([representative]),
                types:
                    types.size > 0
                        ? types.toArray().map((type) => this.apply(type))
                        : [representative],
                conflict: types.size > 1,
            };

            groups.set(representative, group);
        }

        for (const node of this.unionFind.nodes()) {
            const representative = this.unionFind.find(node);

            if (groups.has(representative)) {
                const group = groups.get(representative)!;
                group.nodes.add(node);
                groups.set(representative, group);
            } else {
                groups.set(representative, {
                    nodes: new Set([representative, node]),
                    types: [representative],
                    conflict: false,
                });
            }
        }

        return new Groups(groups);
    }

    private unify(left: Type, right: Type) {
        if (left === right) {
            return;
        }

        const leftNode = left instanceof Node ? left : undefined;
        const rightNode = right instanceof Node ? right : undefined;

        if (leftNode != null && rightNode != null) {
            this.merge(leftNode, rightNode);
        }

        const leftType = this.applyShallow(left);
        if (leftType == null) return;

        const rightType = this.applyShallow(right);
        if (rightType == null) return;

        if (leftType instanceof Node && rightType instanceof Node) {
            // already merged groups above
        } else if (leftType instanceof Node) {
            this.insert(leftType, rightType);
        } else if (rightType instanceof Node) {
            this.insert(rightType, leftType);
        } else {
            if (leftType.tag === rightType.tag) {
                for (
                    let i = 0;
                    i < Math.min(leftType.children.length, rightType.children.length);
                    i++
                ) {
                    const leftChild = leftType.children[i];
                    const rightChild = rightType.children[i];
                    this.unify(leftChild, rightChild);
                }
            }

            if (
                leftType.tag !== rightType.tag ||
                leftType.children.length !== rightType.children.length
            ) {
                this.error = true;

                if (leftNode != null) {
                    this.insert(leftNode, leftType, rightType);
                }

                if (rightNode != null) {
                    this.insert(rightNode, leftType, rightType);
                }
            }
        }
    }

    apply(type: Type) {
        return traverseType(type, (type) => this.applyShallow(type));
    }

    private applyShallow(type: Type) {
        if (type instanceof Node) {
            const representative = this.unionFind.find(type);
            return (
                this.groups.find(([node]) => node === representative)?.[1].first() ?? representative
            );
        } else {
            return type;
        }
    }

    private insert(node: Node, ...types: Type[]) {
        const representative = this.unionFind.find(node);

        // Prevent recursive types
        types = types.filter((type) => !typeReferencesNode(type, representative));
        if (types.length === 0) {
            return;
        }

        const index = this.groups.findIndex(([node]) => node === representative);

        if (index === -1) {
            this.groups = this.groups.push([representative, ImmutableList(types)]);
        } else {
            let existing = this.groups.get(index)![1];
            for (const type of types) {
                if (existing.every((other) => !typesAreEqual(type, other))) {
                    existing = existing.push(type);
                }
            }

            this.groups = this.groups.set(index, [representative, existing]);
        }
    }

    private merge(left: Node, right: Node) {
        const leftRepresentative = this.unionFind.find(left);
        const rightRepresentative = this.unionFind.find(right);

        this.unionFind.union(leftRepresentative, rightRepresentative);

        const index = this.groups.findIndex(
            ([representative]) => representative === rightRepresentative,
        );

        if (index !== -1) {
            const rightTypes = this.groups.get(index)![1];
            this.groups = this.groups.delete(index);

            for (const type of rightTypes) {
                this.unify(leftRepresentative, type);
            }
        }
    }
}

export interface Group {
    nodes: Set<Node>;
    types: Type[];
    conflict: boolean;
}

export class Groups {
    groups: Map<Node, Group>;

    constructor(groups: Map<Node, Group>) {
        this.groups = groups;
    }

    [Symbol.iterator]() {
        return this.groups.values();
    }

    nodes() {
        return this.groups.values().flatMap((group) => group.nodes);
    }
}
