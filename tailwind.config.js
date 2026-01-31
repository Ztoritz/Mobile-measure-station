/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                slate: {
                    950: '#020617', // Darker background for OLED
                }
            },
            touchAction: {
                'manipulation': 'manipulation',
            }
        },
    },
    plugins: [],
}
