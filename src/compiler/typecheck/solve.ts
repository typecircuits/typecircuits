import { Map as ImmutableMap, List as ImmutableList } from "immutable";
import { scoreType, traverseType, typeReferencesNode, typesAreEqual, type Type } from "./type";
import { UnionFind } from "./union-find";
import { Node } from "../lower/node";

export interface TypeConstraint {
    node: Node;
    type: Type;
}

export class Solver {
    private typeConstraints: TypeConstraint[] = [];
    private overloadConstraints: TypeConstraint[][][] = [];
    private unionFind = new UnionFind();
    private groups = ImmutableMap<Node, ImmutableList<Type>>();
    private error = false;

    typeConstraint(node: Node, type: Type) {
        this.typeConstraints.push({ node, type });
    }

    overloadConstraint(overloads: TypeConstraint[][]) {
        this.overloadConstraints.push(overloads);
    }

    run(nodes: Iterable<Node>): Groups {
        this.runTypeConstraints();
        this.runOverloadConstraints();
        return this.toGroups(nodes);
    }

    private runTypeConstraints() {
        // Form better groups by placing types referencing other nodes first
        this.typeConstraints.sort((left, right) => scoreType(left.type) - scoreType(right.type));

        while (this.typeConstraints.length > 0) {
            const constraint = this.typeConstraints.shift()!;
            this.unify(constraint.node, constraint.type);
        }
    }

    private runOverloadConstraints() {
        while (this.overloadConstraints.length > 0) {
            const overloads = this.overloadConstraints.shift()!;

            if (overloads.length === 1) {
                const [constraints] = overloads;
                for (const constraint of constraints) {
                    this.unify(constraint.node, constraint.type);
                }
            }

            // First resolve each overload on a copy to avoid interfering with
            // existing types if it doesn't unify
            let candidates: TypeConstraint[][] = [];
            overloads: for (const constraints of overloads) {
                const copy = new Solver();
                copy.unionFind = new UnionFind(this.unionFind);
                copy.groups = ImmutableMap(this.groups);
                copy.error = false;

                for (const { node, type } of constraints) {
                    copy.unify(node, type);
                    if (copy.error) {
                        continue overloads;
                    }
                }

                candidates.push(constraints);
            }

            // Use the first candidate as a fallback
            if (candidates.length === 0) {
                candidates = [overloads[0]];
            }

            // Now apply each candidate. If there are multiple candidates, the
            // nodes will have multiple (conflicting) types
            for (const constraints of candidates) {
                for (const { node, type } of constraints) {
                    this.unify(node, type);
                }
            }
        }
    }

    private toGroups(nodes: Iterable<Node>): Groups {
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

        for (const node of [...nodes, ...this.unionFind.nodes()]) {
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

            if (node.display === "untyped") {
                groups.get(representative)!.types = [];
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
            return this.groups.get(representative)?.first() ?? representative;
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

        if (!this.groups.has(representative)) {
            this.groups = this.groups.set(representative, ImmutableList(types));
        } else {
            let group = this.groups.get(representative)!;
            for (const type of types) {
                if (group.every((other) => !typesAreEqual(type, other))) {
                    group = group.push(type);
                }
            }

            this.groups = this.groups.set(representative, group);
        }
    }

    private merge(left: Node, right: Node) {
        const leftRepresentative = this.unionFind.find(left);
        const rightRepresentative = this.unionFind.find(right);

        this.unionFind.union(leftRepresentative, rightRepresentative);

        const rightTypes = this.groups.get(rightRepresentative) ?? ImmutableList();
        this.groups = this.groups.delete(rightRepresentative);

        for (const type of rightTypes) {
            this.unify(leftRepresentative, type);
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

    all() {
        return this.groups.values();
    }

    nodes() {
        return this.groups.values().flatMap((group) => group.nodes);
    }
}
