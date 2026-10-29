This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Piano teacher attendance

`/teacher/attendance` supports actual arrival time correction and silent teacher
check-in. Its same-origin API relays Firebase-authenticated requests to
`https://manage.wheemusic.com/api/teacher/attendance`; deploy that management
endpoint before this frontend. The backend owns authorization, course scope,
transactional lesson deductions and notice suppression. The client only receives
student names, piano classes and attendance metadata. See
`tests/teacher-attendance.test.mjs` for the relay/privacy contract.

Silent check-in must precede a delayed keypad check-in to prevent its notification.
A notification already submitted or delivered cannot be recalled. Weekly lesson
schedules are not changed by recording an actual arrival.

Teacher attendance now uses `/api/teacher/attendance/events` instead of a 15-second
poll. An authenticated server-side Firestore listener emits only change signals;
the existing filtered API provides the visible rows. Additions, edits and deleted
records all invalidate the view. Overlapping events queue a fresh read, so an
in-flight request cannot swallow a later cancellation. Hidden pages unsubscribe;
reconnections and failed reads recover with backoff, without normal polling.

The event stream has a bounded four-minute lifetime (also bounded by token expiry
and Seoul midnight) and then reconnects. Transport keepalives do not read the DB
or refresh the attendance list. Role changes close the subscription immediately.
Firestore rules remain server-only for attendance and financial collections.

Validation: `node --test tests/teacher-attendance*.test.mjs`, TypeScript and ESLint.
The attendance count and time-edit buttons were visually checked with fabricated
students; production attendance must not be changed for a smoke test.
