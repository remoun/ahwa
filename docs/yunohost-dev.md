<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# YunoHost packaging dev loop

This is the iteration loop for working on `packaging/yunohost/`. It's
not a guide for end users — they get [self-host.md](./self-host.md).

## Layers

Three layers, fastest first:

1. **Lint (seconds, runs on Mac).** `make lint` runs
   [package_linter](https://github.com/YunoHost/package_linter)
   against `packaging/yunohost/`. Pure Python, no Linux required.
2. **Live install on the VPS (sub-minute, runs on Mac).**
   `make deploy` rsyncs `packaging/yunohost/` to the VPS over SSH and
   triggers `yunohost app install` (or `app upgrade`). Hit the test
   URL, confirm a fresh table can be created.
3. **CI (minutes, runs in GitHub Actions).** Lint runs on every PR
   touching `packaging/yunohost/**`. Full
   [package_check](https://github.com/YunoHost/package_check)
   integration test added once the install script exists.

## One-time setup

### Passwordless sudo for `yunohost`

The deploy loop runs `sudo yunohost ...` over SSH. Sudo prompting
for a password every iteration breaks the loop. Add a NOPASSWD
rule.

**Gotcha — YNH sources sudo rules from LDAP, not just files.** The
YNH `admins` LDAP role grants `(root) ALL` (without NOPASSWD), and
LDAP rules are evaluated AFTER files. So no amount of fiddling with
`/etc/sudoers.d/` or `/etc/sudoers` itself will override it via
last-match-wins. `sudo -ll` will reveal the rule's source as
`LDAP Role: admins`. Files-only `grep` won't find it.

The fix that actually works is a per-user `Defaults` line that
disables authentication regardless of which rule (file or LDAP)
matches:

```bash
echo 'Defaults:<your-user> !authenticate' | sudo EDITOR='tee -a' visudo
sudo -k                            # clear cached timestamp first
sudo -n true && echo OK            # confirm before relying on it
```

`Defaults:user` lines apply globally for the named user, so they
override the LDAP role's authentication requirement without removing
the role itself.

### Test domain

Pick or create a subdomain like `ahwa-test.<your-domain>`. List
existing domains:

```bash
ssh vps sudo yunohost domain list
```

Add a new one if needed (point the DNS A record at the VPS first):

```bash
ssh vps sudo yunohost domain add ahwa-test.<your-domain>
```

Set it as the deploy target:

```bash
export AHWA_YNH_DOMAIN=ahwa-test.<your-domain>
export AHWA_YNH_PATH=/
```

Or pass them on each Make invocation. The Makefile reads both.

## The loop

```bash
# Edit packaging/yunohost/scripts/install (or whatever)
make -C packaging/yunohost lint        # ~1s
make -C packaging/yunohost deploy      # ~30-90s (first install slower)
make -C packaging/yunohost logs        # tail recent journal entries
```

If the install fails partway, snapshot/restore lets you roll back to
a clean state without a full reinstall:

```bash
make -C packaging/yunohost snapshot    # before risky changes
# ... iterate ...
make -C packaging/yunohost restore-snapshot
```

To start fresh:

```bash
make -C packaging/yunohost remove
```

## Why not LXC / package_check locally on macOS?

`package_check` uses LXC/Incus for container snapshots, which doesn't
run natively on macOS. Local iteration uses the live VPS install
instead — faster feedback, real SSO/nginx integration.

## Optional: `package_check` on the VPS

For exhaustive integration testing (install/remove/upgrade/backup/
restore in different scenarios — visitors-public vs SSO-only, fresh
vs upgrade) without polluting the real YNH instance, run
`package_check` on the VPS itself. It uses LXC containers, so each
test run is isolated.

```bash
# On the VPS, one-time setup:
git clone https://github.com/YunoHost/package_check ~/package_check
sudo ~/package_check/package_check.sh --install-dependencies
```

Then from the Mac:

```bash
make -C packaging/yunohost rsync-package
ssh vps '~/package_check/package_check.sh /tmp/ahwa-ynh-pkg'
```

Slower than `make deploy` (minutes) but tests the full lifecycle.
Use as a pre-PR check; iteration uses the live install loop.
