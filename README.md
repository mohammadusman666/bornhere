# Arriveday

**The world on the day you arrived.**

Enter a name, birth date, optional time, and city to open a shareable birthday time capsule: sky, weather, #1 song, prices, life-in-numbers, your star, headlines, birthday twins, markets, birth-year culture, NASA’s picture of the day, and a printable Certificate of Arrival.

## Stack

- React + Vite + TypeScript + Tailwind
- Cloudflare Workers (SPA assets + `/api/*` Worker)
- Open data: Open-Meteo, Astronomy Engine, Wikipedia On This Day, NASA APOD, bundled Billboard / prices / market snapshots

## Develop

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Deploy

```bash
npx wrangler login
npm run deploy
```

## Story URL shape

`/story/1997-10-24/lahore,%20punjab,%20pakistan?t=13:30&n=Mohammad+Usman`

## Future paywall

Chapters are registered in `src/lib/chapters.ts` with `access: "free" | "paid"`. v1 ships everything as `free`. Flip flags and the existing `SealedChapterCard` shell gates content.
