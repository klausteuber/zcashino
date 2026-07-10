#!/usr/bin/env node

import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const standaloneRoot = resolve('.next/standalone')
const standaloneNextRoot = resolve(standaloneRoot, '.next')
const standalonePublic = resolve(standaloneRoot, 'public')
const standaloneStatic = resolve(standaloneNextRoot, 'static')
const smokeDatabase = resolve('.e2e-smoke.db')

await rm(smokeDatabase, { force: true })
await rm(`${smokeDatabase}-shm`, { force: true })
await rm(`${smokeDatabase}-wal`, { force: true })
await rm(standalonePublic, { recursive: true, force: true })
await rm(standaloneStatic, { recursive: true, force: true })
await mkdir(standaloneNextRoot, { recursive: true })
await cp(resolve('public'), standalonePublic, { recursive: true })
await cp(resolve('.next/static'), standaloneStatic, { recursive: true })

console.log('Prepared standalone public and static assets for smoke testing.')
