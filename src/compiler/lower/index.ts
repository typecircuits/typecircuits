import { Solver, type TypeConstraint } from "../typecheck/solve";
import type { Type } from "../typecheck/type";
import type { Node } from "./node";

export interface Edge {
    from: Node;
    to: Node;
    label: string;
    description?: string;
    example?: [string, string, string];
}

export interface Scope {
    definitions: Record<string, Node>;
    returnValues: ReturnValue[];
}

export interface ReturnValue {
    statement?: Node;
    value?: Node;
    type: Type;
}

export type CompilerOutput = ReturnType<LowerContext["finish"]>;

export class LowerContext {
    options: Record<string, boolean>;
    thisType?: Type;
    private nodes = new Set<Node>();
    private edges: Edge[] = [];
    private scopes: Scope[] = [];
    private solver = new Solver();

    constructor(options: Record<string, boolean>) {
        this.options = options;
        this.pushScope();
    }

    lower(node: Node) {
        node = node.lower(this) ?? node;
        this.nodes.add(node);
        return node;
    }

    edge(edge: Edge) {
        this.edges.push(edge);
    }

    pushScope() {
        this.scopes.push({
            definitions: {},
            returnValues: [],
        });
    }

    popScope() {
        return this.scopes.pop()!;
    }

    scope(): Scope {
        return this.scopes.at(-1)!;
    }

    define(name: string, variable: Node) {
        this.scope().definitions[name] = variable;
    }

    resolve(name: string, at: Node): Node {
        for (const scope of this.scopes.toReversed()) {
            if (name in scope.definitions) {
                return scope.definitions[name];
            }
        }

        // If the variable isn't defined, implicitly define it in the
        // current scope
        this.define(name, at);
        return at;
    }

    withThisType<T>(type: Type, f: () => T): T {
        const previousThisType = this.thisType;
        this.thisType = type;
        const result = f();
        this.thisType = previousThisType;
        return result;
    }

    typeConstraint(node: Node, type: Type) {
        this.solver.typeConstraint(node, type);
    }

    overloadConstraint(overloads: TypeConstraint[][]) {
        this.solver.overloadConstraint(overloads);
    }

    finish() {
        for (const node of [...this.nodes]) {
            if (node.display === "hidden") {
                this.nodes.delete(node);
            }
        }

        const edges = this.edges.filter(
            (edge) => this.nodes.has(edge.from) && this.nodes.has(edge.to),
        );

        const groups = this.solver.run(this.nodes);

        return {
            nodes: Array.from(this.nodes),
            edges,
            groups,
        };
    }
}
