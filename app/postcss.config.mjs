export default {
    plugins: {
        "@tailwindcss/postcss": {},
        autoprefixer: {},
        "postcss-custom-properties": {},
        "@csstools/postcss-oklab-function": {
            subFeatures: { displayP3: false },
        },
        "@csstools/postcss-color-mix-function": {},
    },
};
