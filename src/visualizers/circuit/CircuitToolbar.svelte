<script lang="ts">
    import Button from "@/components/Button.svelte";
    import Icon from "@/components/Icon.svelte";
    import Menu from "@/components/Menu.svelte";
    import MenuButton from "@/components/MenuButton.svelte";
    import { context, getFilter, getFilteredNodes } from "@/context.svelte";
    import { getViewportForBounds, type Rect } from "@xyflow/svelte";
    import { toCanvas } from "html-to-image";

    export interface CircuitToolbarProps {
        getNodesBounds: () => Rect | undefined;
    }

    const { getNodesBounds }: CircuitToolbarProps = $props();

    const saveImage = async () => {
        const imageSize = 1500;

        const nodesBounds = getNodesBounds()!;
        const aspectRatio = nodesBounds.height / nodesBounds.width;
        const viewport = getViewportForBounds(
            nodesBounds,
            imageSize,
            imageSize * aspectRatio,
            -Infinity,
            Infinity,
            0.5,
        );

        const viewportElement = document.querySelector<HTMLElement>(".svelte-flow__viewport")!;

        const canvas = await toCanvas(viewportElement, {
            width: imageSize,
            height: imageSize * aspectRatio,
            style: {
                width: `${imageSize}px`,
                height: `${imageSize * aspectRatio}px`,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
        });

        // Crop canvas to content

        let minX = imageSize;
        let maxX = 0;
        let minY = imageSize * aspectRatio;
        let maxY = 0;
        const imageData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const index = (y * imageData.width + x) * 4;

                const alpha = imageData.data[index + 3];
                if (alpha === 0) {
                    continue;
                }

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        const croppedCanvas = document.createElement("canvas");
        croppedCanvas.width = maxX - minX;
        croppedCanvas.height = maxY - minY;
        const ctx = croppedCanvas.getContext("2d")!;
        ctx.drawImage(
            canvas,
            minX,
            minY,
            croppedCanvas.width,
            croppedCanvas.height,
            0,
            0,
            croppedCanvas.width,
            croppedCanvas.height,
        );

        // Save as image

        const link = document.createElement("a");
        link.href = croppedCanvas.toDataURL();
        link.download = `typecircuits-${Date.now()}.png`;
        link.click();
    };

    const onscan = () => {
        if (context.compileResult == null) return;

        const filter = getFilter();

        const filteredNodes = getFilteredNodes();
        if (filteredNodes == null) return;

        const cards = filteredNodes.map((node) => node.toString());

        const groups = Iterator.from(context.compileResult.groups)
            .map((group) =>
                group.nodes
                    .values()
                    .filter(filter)
                    .map((node) => filteredNodes!.indexOf(node))
                    .toArray(),
            )
            .filter((group) => group.length > 0)
            .toArray();

        const data = { cards, groups };

        const url = new URL(import.meta.env.VITE_SCAN_URL);
        url.searchParams.set("data", JSON.stringify(data));
        window.open(url.toString(), "_blank");
    };
</script>

<Button onclick={saveImage}>
    <Icon>download</Icon>
    Save
</Button>

<Menu>
    <Button>
        <Icon>print</Icon>
        Print
    </Button>

    {#snippet items()}
        <MenuButton onclick={() => (context.printing = {})}>
            <Icon>draft</Icon>
            Standard
        </MenuButton>

        <MenuButton onclick={() => (context.printing = { trackers: true })}>
            <Icon>qr_code_scanner</Icon>
            With Trackers
        </MenuButton>
    {/snippet}
</Menu>

<Button onclick={onscan}>
    <Icon>qr_code_scanner</Icon>
    Scan
</Button>
