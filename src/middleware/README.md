# Middlewares

This folder contains middlewares for the SSR pages/endpoints

They are run for every paths independent of the middleware and in the specified order of the `index.ts`

## locals

You can pass variables to other middlewares and endpoints by adding a variable in `locals` and in `App.Locals` in `env.d.ts`
