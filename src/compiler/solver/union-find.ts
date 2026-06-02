import { List as ImmutableList } from "immutable";
import type { Node } from "../index";

export class UnionFind {
    sets = ImmutableList<ImmutableList<Node>>();

    constructor(copy?: UnionFind) {
        if (copy) {
            this.sets = ImmutableList(copy.sets);
        }
    }

    union(left: Node, right: Node) {
        const toUnify: ImmutableList<Node>[] = [];
        const toKeep: ImmutableList<Node>[] = [];
        for (const set of this.sets) {
            if (set.includes(left) || set.includes(right)) {
                toUnify.push(set);
            } else {
                toKeep.push(set);
            }
        }

        const union = toUnify.reduce(
            (result, set) => {
                for (const node of set) {
                    if (!result.includes(node)) {
                        result = result.push(node);
                    }
                }

                return result;
            },
            ImmutableList([left, right]),
        );

        this.sets = ImmutableList([...toKeep, union]);
    }

    tryFind(node: Node): Node | undefined {
        const result: Node[] = [];
        for (const set of this.sets) {
            if (set.includes(node)) {
                result.push([...set][0]); // will be consistent because sets are ordered
            }
        }

        if (result.length > 1) {
            throw new Error("node belongs to multiple sets");
        }

        return result[0];
    }

    find(node: Node) {
        const representative = this.tryFind(node);
        if (representative != null) {
            return representative;
        } else {
            this.sets = this.sets.push(ImmutableList([node]));
            return node;
        }
    }

    nodes() {
        return Iterator.from(this.sets.values())
            .flatMap((nodes) => nodes)
            .toArray();
    }
}
