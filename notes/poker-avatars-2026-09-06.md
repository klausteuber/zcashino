# Poker identity avatars

Players can choose Fox, Wolf, Owl, Panda, Tiger, Lion, Frog or Octopus from their poker identity panel. The selected avatar appears in the account header and beside their name at occupied poker seats. Each choice uses a local catalog and native emoji; no uploads, external images, or tracking requests are involved.

The optional PokerIdentity.avatar field holds a catalog ID. Existing identities have a stable default derived from their identity ID. The same identity is retained during wallet session recovery, so the selection follows the player across devices and brands. Table snapshots join the latest avatar using the transaction client and expose only the catalog ID, never session IDs. Cosmetic changes do not mutate the engine state, table version, ledger, nickname or entry grants.

The authenticated same-origin access endpoint accepts only a strict catalog selection. Avatar persistence, restored authentication, live occupied-seat updates, unchanged funds/grants, spoofing rejection, selection errors, and migration preservation are covered by tests.

Gotcha caught during implementation: the shared identity POST helper clears a newly generated recovery key after setup. Avatar updates must preserve that unsaved key so choosing an avatar cannot erase the player's only visible copy. Avatar writes opt into preserving it.

Deployment requires additive migration 20260906040000_poker_avatar. Back up SQLite online, rehearse the exact migrator image on a copy, compare core table counts and integrity, then apply it before starting the new app. Old app versions tolerate the extra nullable field; rollback does not require dropping it.
