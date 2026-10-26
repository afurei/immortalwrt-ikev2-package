# luci-app-ipsec-ikev2

`luci-app-ipsec-ikev2` is a LuCI JavaScript application for configuring a strongSwan IKEv2 Road-Warrior VPN server on OpenWrt.

It is designed for the OpenWrt 24.10+ `swanctl` UCI workflow and does not use the legacy `/etc/ipsec.conf` configuration style.

## Features

- Configure IKEv2 Road-Warrior responders from LuCI.
- Support certificate `pubkey` and EAP-MSCHAPv2 username/password authentication profiles.
- Manage `/etc/config/ipsec` strongSwan UCI sections.
- Manage the XFRM network interfaces used by the VPN, with the tunnel link derived from the configured uplink.
- Configure IKE and ESP crypto proposals.
- Preview and apply recommended firewall rules without blindly overwriting existing custom rules.
- Generate CA, server, and client certificates.
- Export client `.p12` bundles for certificate-based mobile and desktop clients.
- Manage EAP-MSCHAPv2 users without showing stored passwords in the browser.
- View `swanctl` service status, package readiness, basic validation checks, and filtered IPsec logs.
- Explicitly enable, disable, start, stop, restart, or reload the `swanctl` service from LuCI.
- Includes English template and Simplified Chinese translation files.

## Target Environment

- OpenWrt 24.10 or newer.
- LuCI JavaScript frontend.
- strongSwan using `swanctl` and UCI configuration.
- firewall4/nftables based firewall.

Older OpenWrt versions, legacy `/etc/ipsec.conf`, and non-UCI strongSwan setups are not the target of this application.

## Dependencies

The package Makefile declares the main runtime dependencies:

- `luci-base`
- `rpcd`
- `jsonfilter`
- `ip-full`
- `xfrm`
- `luci-proto-xfrm`
- `kmod-crypto-sha256`
- `kmod-crypto-gcm`
- `kmod-crypto-chacha20poly1305`
- `strongswan-swanctl`
- `strongswan-charon`
- `strongswan-pki`
- `strongswan-mod-kernel-netlink`
- `strongswan-mod-socket-default`
- `strongswan-mod-pubkey`
- `strongswan-mod-pem`
- `strongswan-mod-pkcs1`
- `strongswan-mod-x509`
- `strongswan-mod-constraints`
- `strongswan-mod-openssl`
- `strongswan-mod-gcm`
- `strongswan-mod-aes`
- `strongswan-mod-sha2`
- `strongswan-mod-random`
- `strongswan-mod-eap-identity`
- `strongswan-mod-eap-mschapv2`
- `strongswan-mod-md4`
- `strongswan-mod-des`
- `openssl-util`

Certificate generation and `.p12` export use the standalone `pki` command from `strongswan-pki` and `openssl`; the package therefore depends on `strongswan-pki` and `openssl-util` without pulling in the legacy `strongswan-ipsec` service. EAP-MSCHAPv2 also needs the `eap-identity`, `eap-mschapv2`, `md4`, and `des` strongSwan plugins. Some OpenWrt/ImmortalWRT builds mark EAP-MSCHAPv2 and MD4 as insecure modules, so those packages may require a matching SDK or custom package feed that enables them.

## Build

Place this directory in an OpenWrt buildroot package feed, then update and install the feed package.

Example:

```sh
./scripts/feeds update luci
./scripts/feeds install luci-app-ipsec-ikev2
make menuconfig
make package/luci-app-ipsec-ikev2/compile V=s
```

The generated package format follows the target build system:

- OpenWrt/ImmortalWRT 25.12 or newer uses `.apk` packages.
- OpenWrt/ImmortalWRT 24.10 and older uses `.ipk` packages.

When building for an APK based target, use the matching release or snapshot SDK for the exact target and kernel ABI. For example, an ImmortalWRT `qualcommax/ipq807x` APK package should be built with the matching ImmortalWRT `qualcommax/ipq807x` SDK, not with a different OpenWrt release or target SDK.

The package will usually appear under the target package output directory, for example:

```text
bin/packages/<arch>/<feed>/luci-app-ipsec-ikev2_*.ipk
bin/packages/<arch>/<feed>/luci-app-ipsec-ikev2-*.apk
```

The Makefile supports both common LuCI package layouts:

- inside a LuCI feed, using `../../luci.mk`
- inside another package feed, using `$(TOPDIR)/feeds/luci/luci.mk`

## Install

Install the generated package on the target router.

For OpenWrt/ImmortalWRT 25.12 or newer APK based systems:

```sh
apk add --allow-untrusted ./luci-app-ipsec-ikev2-*.apk
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

For OpenWrt/ImmortalWRT 24.10 and older opkg based systems:

```sh
opkg install luci-app-ipsec-ikev2_*.ipk
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

Then open LuCI and go to:

```text
VPN -> IPsec IKEv2
```

## First Use

1. Open `Server` and set the IKEv2 server identifier, for example `vpn.example.net`.
2. Verify the client address pool and XFRM interface settings.
3. Open `Crypto` and review or apply the modern default crypto proposals.
4. Open `Certificates` and generate the CA certificate.
5. Generate the server certificate using the same identifier configured on the `Server` page.
6. Open `Advanced` and preview/apply the recommended network and firewall changes.
7. Choose one or both authentication profiles:
   - For certificate auth, generate a client certificate, export a `.p12` bundle, then enable `remote rw_pubkey` on `Server`.
   - For EAP-MSCHAPv2 auth, open `Users`, create at least one username/password, then enable `remote rw_eap` on `Server`.
8. Save and apply the configuration.
9. Open `Overview` and start or restart the `swanctl` service.

## Pages

### Overview

Shows service and runtime state:

- `swanctl` installed/running status
- `charon` running status
- active IKE and CHILD SA counts
- missing package summary
- certificate readiness
- configuration validation checks
- filtered IPsec logs
- service action buttons

### Server

Configures the Road-Warrior responders and related network settings:

- global IPsec settings
- `remote rw_pubkey` for certificate public-key authentication
- `remote rw_eap` for EAP-MSCHAPv2 username/password authentication
- `pools primaryipv4`
- `tunnel rw_child`
- `network.vpn`
- `network.vpn_vip`

Both responders are disabled by default after installation and must be explicitly enabled.

### Users

Manages EAP-MSCHAPv2 identities stored in `/etc/config/ipsec` as `mschapv2_secrets` sections.

Supported actions:

- create or update an EAP username/password
- enable or disable an EAP user
- delete an EAP user
- list configured users without returning the stored password

Disabled users are kept as `mschapv2_secrets_disabled`, which is ignored by the OpenWrt strongSwan swanctl init script.

The package enables `ipsec-ikev2-permissions` at boot before `swanctl`. It pre-creates the generated runtime configuration directory as `0700` and `/tmp/swanctl/swanctl.conf` as `0600`, because that file contains plaintext EAP shared secrets while an EAP profile is loaded.

### Crypto

Configures crypto proposals:

- `ike_proposal`
- `esp_proposal`
- `esp_proposal_legacy`
- child tunnel proposal binding

The modern defaults use AES-GCM based proposals and leave the legacy ESP proposal disabled unless explicitly enabled.

### Certificates

Manages strongSwan certificate material in fixed paths:

```text
/etc/swanctl/private
/etc/swanctl/x509ca
/etc/swanctl/x509
```

Supported actions:

- generate CA key/certificate
- generate server key/certificate
- generate client key/certificate
- export client `.p12` bundle
- list existing CA, server, and client certificate status

Private keys are never displayed in the browser. Exported `.p12` bundles are written to:

```text
/tmp/luci-ipsec-ikev2
```

The export password is not stored in UCI.

### Advanced

Previews and applies firewall settings derived from the configured uplink, VPN firewall zone, and VPN gateway address. It also provides the application's detailed, read-only configuration diagnostics.

Firewall sync manages:

- the configured VPN firewall zone
- optional forwarding from the VPN zone to the firewall zone containing the selected uplink network
- source-restricted masquerading for the configured VPN gateway subnet
- UDP 500 rule
- UDP 4500 rule
- ESP rule
- optional AH rule

The firewall action adds missing sections or options. Existing conflicting values are reported in the result table and are not overwritten automatically. Network interfaces are configured directly on the `Server` page; there is no separate network-sync action.

## Default UCI Model

On installation, the uci-defaults script initializes missing `/etc/config/ipsec` sections such as:

- `config ipsec`
- `remote rw_pubkey` for certificate public-key authentication
- `remote rw_eap` for EAP-MSCHAPv2 username/password authentication
- `crypto_proposal ike_proposal`
- `tunnel rw_child`
- `crypto_proposal esp_proposal`
- `crypto_proposal esp_proposal_legacy`
- `pools primaryipv4`

The script is designed to be idempotent. It preserves existing IPsec settings. The uplink is selected from an existing configured interface: first from the current IPsec setting, then from the live default route, a configured gateway, a dynamic uplink protocol, or an unambiguous single non-VPN interface. It never falls back to a hard-coded `wan` or `lan` name.

If `network.vpn` already exists, its `tunlink` and firewall `zone` are synchronized to the global IPsec settings because they are derived values rather than second user settings. Its `ifid` is the single editable XFRM ID and is synchronized to `ipsec.rw_child.if_id`. The fixed protocol and gateway-device values are written internally instead of exposed as one-choice controls. When neither responder is enabled, `swanctl` is disabled at boot and stopped.

## Safety Notes

Installation does not automatically:

- enable the IKEv2 responder
- enable or start `swanctl`
- modify `/etc/config/firewall`
- overwrite existing IPsec settings

The `Server` page is the source of truth for the uplink, VPN firewall zone, and XFRM ID. Saving it synchronizes `network.vpn.tunlink`, `network.vpn.zone`, and the child-tunnel XFRM ID. Firewall changes are only applied when explicitly requested from the `Advanced` page.

When uplink access is requested, firewall synchronization enables masquerading on the firewall zone that actually contains the selected uplink network. If that zone was not already masqueraded, the source restriction is calculated from `network.vpn_vip.ipaddr`; there is no fixed VPN source subnet fallback. This is required on deployments where the upstream router has no return route for the configured VPN pool.

The rpcd helper exposes fixed methods only and does not accept arbitrary shell commands or arbitrary file paths.

## Client Import Notes

For certificate authentication, the exported `.p12` bundle is intended for IKEv2 clients such as iOS, macOS, Android, or Windows.

Typical certificate-client requirements:

- import the CA certificate or trust the generated CA
- import the client `.p12` bundle
- use the server identifier configured on the `Server` page
- connect with IKEv2 certificate authentication

For EAP-MSCHAPv2 authentication, clients still need to trust the CA/server certificate, but they authenticate with the username and password created on the `Users` page instead of a client certificate.

Exact client setup differs by operating system.

## Known Limitations

- EAP-TLS, PSK, and advanced multi-profile workflows are not implemented.
- The UI reports the exported `.p12` path but does not yet provide a dedicated download endpoint.
- The firewall sync logic reports conflicts but does not rewrite existing conflicting values.
- EAP-MSCHAPv2 package availability depends on whether the target strongSwan feed enables insecure modules.
- The project still needs OpenWrt buildroot compilation and real-device testing before regular use.

## Troubleshooting

If the LuCI menu does not appear:

```sh
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
```

If `Overview` reports missing packages, install the missing strongSwan modules and restart `rpcd`.

If certificate generation fails, check that `pki` and `openssl` are installed and that `/etc/swanctl/private` is writable.

If clients cannot connect, check:

- UDP 500 and UDP 4500 are allowed from WAN
- ESP is allowed from WAN
- the server identifier matches the server certificate SAN/CN
- the client trusts the generated CA
- EAP clients use a username present on the `Users` page and the matching password
- `swanctl --list-conns`
- `swanctl --list-sas`
- `logread | grep -Ei 'charon|swanctl|ipsec|strongswan'`

## Validation Checklist

Before using on a production router, test on a spare device or lab build:

- build package in OpenWrt buildroot
- install generated `.apk` or `.ipk` package
- confirm menu appears under `VPN -> IPsec IKEv2`
- confirm all pages open without JavaScript errors
- confirm UCI save/apply works on Server and Crypto pages
- preview and apply Advanced network/firewall sync
- generate CA/server/client certificates
- export and import a `.p12` bundle
- create an EAP user and verify `rw_eap` loads in `swanctl --list-conns`
- start `swanctl`
- connect at least one real client

## License

This project is licensed under [GPL-2.0-only](https://spdx.org/licenses/GPL-2.0-only.html).
