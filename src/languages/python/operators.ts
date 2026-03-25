import type { Node } from "@/compiler/lower/node";
import type { TypeConstraint } from "@/compiler/typecheck/solve";
import * as types from "./types";
import type { BuiltinConstraints } from "./builtins";

type OperatorConstraints = (left: Node, right: Node, result: Node) => BuiltinConstraints;

const mathOverloads = (left: Node, right: Node, result: Node): TypeConstraint[][] => [
    [
        { node: left, type: types.int },
        { node: right, type: types.int },
        { node: result, type: types.int },
    ],
    [
        { node: left, type: types.float },
        { node: right, type: types.float },
        { node: result, type: types.float },
    ],
];

const comparisonOverloads = (left: Node, right: Node, result: Node): TypeConstraint[][] => [
    [
        { node: left, type: types.int },
        { node: right, type: left },
        { node: result, type: types.bool },
    ],
    [
        { node: left, type: types.float },
        { node: right, type: left },
        { node: result, type: types.bool },
    ],
];

const logicOperatorTypes = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: left, type: types.bool },
    { node: right, type: left },
    { node: result, type: left },
];

const equalityTypes = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: right, type: left },
    { node: result, type: types.bool },
];

export const operators: Record<string, OperatorConstraints> = {
    "+": (left, right, result) => ({
        overloads: [
            ...mathOverloads(left, right, result),
            [
                { node: left, type: types.str },
                { node: right, type: types.str },
                { node: result, type: types.str },
            ],
        ],
    }),
    "-": (left, right, result) => ({ overloads: mathOverloads(left, right, result) }),
    "*": (left, right, result) => ({ overloads: mathOverloads(left, right, result) }),
    "/": (left, right, result) => ({ overloads: mathOverloads(left, right, result) }),
    "%": (left, right, result) => ({ overloads: mathOverloads(left, right, result) }),
    "**": (left, right, result) => ({ overloads: mathOverloads(left, right, result) }),
    "==": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "!=": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "<": (left, right, result) => ({ overloads: comparisonOverloads(left, right, result) }),
    "<=": (left, right, result) => ({ overloads: comparisonOverloads(left, right, result) }),
    ">": (left, right, result) => ({ overloads: comparisonOverloads(left, right, result) }),
    ">=": (left, right, result) => ({ overloads: comparisonOverloads(left, right, result) }),
    and: (left, right, result) => ({ types: logicOperatorTypes(left, right, result) }),
    or: (left, right, result) => ({ types: logicOperatorTypes(left, right, result) }),
};
