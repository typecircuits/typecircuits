<script lang="ts">
    import { AprilTagFamily } from "apriltag";
    import tagConfig36h11 from "apriltag/families/36h11.json";

    interface Props {
        index: number;
    }

    const family = new AprilTagFamily(tagConfig36h11);
    const size = 10;
    const scale = 20;

    const { index }: Props = $props();

    const tagImage = $derived.by(() => {
        const canvas = document.createElement("canvas");
        canvas.width = size * scale;
        canvas.height = size * scale;

        const ctx = canvas.getContext("2d")!;

        const markerData = family.render(index);
        console.log({ markerData });
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const marker = markerData[y][x];
                switch (marker) {
                    case "w":
                        ctx.fillStyle = "white";
                        break;
                    case "b":
                        ctx.fillStyle = "black";
                        break;
                    case "x":
                        ctx.fillStyle = "transparent";
                        break;
                    default:
                        marker satisfies never;
                }

                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }

        return canvas.toDataURL();
    });
</script>

<img
    src={tagImage}
    alt=""
    class="mx-auto mb-[24px] block size-[0.65in]"
    style:image-rendering="pixelated"
/>
