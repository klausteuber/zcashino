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
