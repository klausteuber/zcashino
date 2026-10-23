# Zebra 7.0.0 production upgrade

Target: `root@93.95.226.186:/opt/zcashino`, mainnet Compose project.

Pin the official `zfnd/zebra:7.0.0` image by digest
`sha256:a70d2be8ffef3a4b6e37355724e36a0e6c1838e46baa28bfb216739f00cf2d34`.
The image reports `zebrad 7.0.0+git.e8db87e`.

## Compatibility and backup

Zebra 7 migrates state v28 to v29 on first start. Version 6 cannot open v29.
Never roll back only the image against the upgraded database.
The existing Zallet beta.1 uses the Zaino RPC backend and does not mount Zebra's
database. Direct database backends require a separate compatibility review.

The node has 263 GiB of state with approximately 81 GiB of free disk. Preserve
an offline rollback snapshot at `/opt/zcashino/backups/zebra7-20261023/zebra-v28`:
stop app, wallet, and node; hard-link only immutable RocksDB `.sst` files; copy
all other files independently with ownership and modes preserved. Verify shared
SST inodes, independent mutable-file inodes, sizes, and mutable-file hashes.
This is a same-disk rollback snapshot, not protection against disk loss. Never
edit, chmod, or chown its shared SST files. Retaining it also retains obsolete
SSTs after compaction, so monitor disk use.

Keep full stopped-wallet and app-data archives, a SQLite online-format backup
verified with `PRAGMA integrity_check`, protected configuration copies, archive
checksums, and the previous Git commit in the same root-only backup directory.
Use the existing node-monitor pause file during planned downtime, preserving
any pause that existed beforehand.

## Rollout and checks

Publish the Compose change to GitHub first, then fast-forward production.
Recreate only Zebra with `docker compose --env-file .env.mainnet -p mainnet
-f docker-compose.mainnet.yml up -d --no-deps zebra`. No app build or application
schema migration is needed for this node-only update.

Verify the exact running version, successful v29 state opening, RPC readiness,
chain progression, Zallet scanning and balances, container health, and internal
and public application health. Before upgrade, app health already reported
six stuck Veilstone matches and a transient two-block wallet lag; distinguish
those pre-existing conditions from upgrade regressions.

## Rollback

Before NU7 activation only: stop app, Zallet, and Zebra; preserve the failed
upgraded cache under a new name; restore the complete `zebra-v28` snapshot to
the original volume path by linking immutable SSTs and copying all other files.
Revert this release's Compose change through GitHub, pull it, and recreate
Zebra using the previous pinned 6.0.0 image. Start Zallet and app, then verify
sync and health. Preserve the snapshot itself during restoration. Do not
restore wallet/app backups over newer financial activity merely to roll back
Zebra. After NU7 activation, Zebra 6.0.0 is not a valid operational fallback.

References: [Zebra 7 release](https://github.com/ZcashFoundation/zebra/releases/tag/v7.0.0),
[release candidate compatibility notes](https://github.com/ZcashFoundation/zebra/releases/tag/v7.0.0-rc.0),
[RocksDB checkpoint semantics](https://github.com/facebook/rocksdb/wiki/Checkpoints).

## Execution record

- Release commit: `df948e8`, fast-forwarded from `c17603f` on production.
- Passed: `npm run lint`, `npx tsc --noEmit`, and 13 tests across
  `src/lib/wallet/rpc-zallet.test.ts` and `src/app/api/health/route.test.ts`.
- Backup verified before migration: 17,124 immutable SST files linked,
  1,022 other files independently copied, 281,246,876,316 logical bytes.
  Wallet archive includes both `wallet.db` and `encryption-identity.txt`.
  App SQLite integrity check and all three archive/database checksums passed.
- Disposable rehearsal migrated v28 to v29, reported valid database format,
  and served blockchain RPCs at height 3,528,269 with Zebra 7.0.0.
- Production migrated successfully and advanced to height 3,528,271; readiness
  endpoint passed, nine peers were observed, all three containers were healthy,
  public homepage returned HTTP 200, and confirmed house balance remained
  5.96882 ZEC with no pending withdrawals.
- At 22:08:18 UTC (15:08:18 PDT), node, wallet, and fully-synced heights all
  matched at 3,528,284. Internal and public health then both reported connected
  and synced, database available, confirmed balance 5.96882 ZEC, zero pending
  withdrawals, and healthy seed pool/ledger invariants. Their overall status
  remains `warning` solely for the same six pre-existing stuck Veilstone
  matches. This verifies the node/wallet upgrade, not a completely clean app
  health result; no game records were changed to suppress that warning.
- A temporary `/ready` warning during observation coincided with a network
  block gap: the independent Blockchair explorer reported the same height and
  block hash. Readiness returned to `ok` when new blocks arrived. Do not infer
  an actual fork or missing blocks solely from Zebra's time-based tip estimate.
- Normal node monitoring was restored. The existing hourly disk monitor is
  enabled; approximately 81 GiB remained free. Disposable rehearsal and failed
  copy artifacts were removed, preserving the complete rollback snapshot.
- An encrypted `recovery-bundle.tar.gpg` containing wallet, app, configuration,
  and backup metadata was created and test-decrypted on the server. It excludes
  the large node database. SHA-256:
  `fce6f1cd57f0103f5eb4c2425e5fc6607f003fd82ec89eef92493feab2f24775`.
  After explicit authorization, the bundle was copied to
  `/Users/cmmacbook/Code/Zcashino/backups/zebra7-20261023/recovery-bundle.tar.gpg`
  with mode 0600 in a 0700 directory. Its local SHA-256 matched the server copy.

## Operational lessons

- The production Python predates `hashlib.file_digest`; use a streaming SHA-256
  loop for portable backup verification. An incomplete copy is not a verified
  backup and must never authorize the migration.
- The app did not exit on SIGTERM within 120 seconds and Docker stopped it with
  exit 137. A stopped SQLite copy must include WAL/recovery files, and the
  resulting `.backup` must pass integrity checking. Zebra and Zallet stopped
  without that forced-exit condition.
- `docker compose start` can start dependency/init/migration containers. For
  resuming existing services without those dependencies, use explicit
  `docker start mainnet-zebra-1 mainnet-zallet-1 mainnet-app-1` after the relevant
  readiness checks; use Compose `up --no-deps zebra` for the actual replacement.
- A network-disabled Zebra rehearsal can validate migration but waits on seed
  discovery before serving RPC. Recreate the disposable container on the
  private Compose network for RPC validation; Docker cannot attach an extra
  network to a container using network mode `none`.
- Zallet beta.1 may recheck roughly 1,000 recent blocks after restarting. Its
  container health and RPC availability do not prove wallet readiness. Wait
  for node tip, wallet tip, and fully synced height to match before declaring
  wallet verification successful.
