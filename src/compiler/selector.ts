import type { Node } from "./index";

export type Selector<T> = (node: Node, callback: (value: T) => void) => void;

export type SelectorValue<S> = S extends Selector<infer T> ? T : never;

export const node =
    (type: string): Selector<Node> =>
    (node, callback) => {
        if (node.type === type) {
            callback(node);
        }
    };

export const map =
    <A, B>(selector: Selector<A>, f: (value: A) => B | undefined): Selector<B> =>
    (node, callback) =>
        selector(node, (value) => {
            let result: B | undefined;
            try {
                result = f(value);
            } catch (error) {
                if (error instanceof TypeError) {
                    // ignore
                } else {
                    throw error;
                }
            }

            if (result != null) {
                callback(result);
            }
        });

export const event = <E extends string, T>(type: E, selector: Selector<T>) =>
    map(selector, (value) => ({ type, value }));
