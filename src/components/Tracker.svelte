<script lang="ts">
    import { AprilTagFamily } from "apriltag";
    import tagConfig36h11 from "apriltag/families/36h11.json";

    interface Props {
        index: number;
    }

    const family = new AprilTagFamily(tagConfig36h11);
    const scale = 20;

    const { index }: Props = $props();

    const tagImage = $derived.by(() => {
        const markerData = family.render(index);
        const size = markerData.length;
        const border = 1; // skip drawing the white border

        const canvas = document.createElement("canvas");
        canvas.width = size * scale;
        canvas.height = size * scale;

        const ctx = canvas.getContext("2d")!;
        for (let y = border; y < size - border; y++) {
            for (let x = border; x < size - border; x++) {
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

<img src={tagImage} alt="" class="mx-auto my-[10px] block size-[0.75in]" />
