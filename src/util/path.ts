import type { ElkPoint } from "elkjs/lib/elk-api";
import { roundCorners } from "svg-round-corners";

const cornerRadius = 10;

export const pathFromPoints = (points: ElkPoint[]) =>
    roundCorners(
        points.map(({ x, y }, i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" "),
        cornerRadius,
    ).path;
