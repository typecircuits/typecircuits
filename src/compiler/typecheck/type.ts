import { Node } from "../lower/node";

export interface ConstructedType {
    tag: unknown;
    children: Type[];
    display: (children: string[], root: boolean) => string;
}

export type Type = Node | ConstructedType | null;

export const type = (type: Type) => type;

export const displayType = (type: Type, root = true): string => {
    if (isConstructedType(type)) {
        const children = type.children.map((child) => displayType(child, false));
        return type.display(children, root);
    } else {
        return "_";
    }
};

export const traverseType = (type: Type, f: (type: Type) => Type): Type => {
    type = f(type);

    return isConstructedType(type)
        ? { ...type, children: type.children.map((child) => traverseType(child, f)) }
        : type;
};

export const scoreType = (type: Type) => {
    if (typeReferencesNode(type)) {
        return 1;
    } else if (isConstructedType(type)) {
        return 2;
    } else {
        return 0;
    }
};

export const typesAreEqual = (left: Type, right: Type): boolean =>
    isConstructedType(left) && isConstructedType(right)
        ? left.tag === right.tag &&
          left.children.length === right.children.length &&
          left.children.every((leftChild, index) => {
              const rightChild = right.children[index];
              return typesAreEqual(leftChild, rightChild);
          })
        : left === right;

export const typeReferencesNode = (type: Type, node?: Node) => {
    let referencesNode = false;
    traverseType(type, (type) => {
        referencesNode ||= node ? type === node : type instanceof Node;
        return type;
    });

    return referencesNode;
};

export const isConstructedType = (type: Type): type is ConstructedType =>
    type != null && !(type instanceof Node);
