include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ipsec-ikev2
PKG_VERSION:=0.2.0
PKG_RELEASE:=11
PKG_LICENSE:=GPL-2.0-only
PKG_MAINTAINER:=shaka

LUCI_TITLE:=LuCI support for IPsec IKEv2 Road-Warrior
LUCI_DEPENDS:=+luci-base +rpcd +jsonfilter +ip-full +xfrm +luci-proto-xfrm +kmod-crypto-sha256 +kmod-crypto-gcm +kmod-crypto-chacha20poly1305 +strongswan-swanctl +strongswan-charon +strongswan-pki +strongswan-mod-kernel-netlink +strongswan-mod-socket-default +strongswan-mod-pubkey +strongswan-mod-pem +strongswan-mod-pkcs1 +strongswan-mod-x509 +strongswan-mod-constraints +strongswan-mod-openssl +strongswan-mod-gcm +strongswan-mod-aes +strongswan-mod-sha2 +strongswan-mod-random +strongswan-mod-eap-identity +strongswan-mod-eap-mschapv2 +strongswan-mod-md4 +strongswan-mod-des +openssl-util
LUCI_PKGARCH:=all

ifeq ($(wildcard ../../luci.mk),)
include $(TOPDIR)/feeds/luci/luci.mk
else
include ../../luci.mk
endif

# call BuildPackage - OpenWrt buildroot signature
