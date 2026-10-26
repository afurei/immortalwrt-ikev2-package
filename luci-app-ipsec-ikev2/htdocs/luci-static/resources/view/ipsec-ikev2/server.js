'use strict';
'require form';
'require rpc';
'require uci';
'require view';

var callListCerts = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'list_certs',
	expect: { '': {} }
});

function fixedValue(o, value) {
	o.default = value;
	o.rmempty = false;
	o.forcewrite = true;
	o.cfgvalue = function() { return value; };
}

function isSelectableUplink(name) {
	var section;

	if (!name || name == 'loopback' || name == 'vpn' || name == 'vpn_vip')
		return false;

	section = uci.get('network', name);
	return !!(section && section['.type'] == 'interface' && section.disabled != '1');
}

function interfaceNames() {
	var names = [];

	uci.sections('network', 'interface', function(section) {
		if (isSelectableUplink(section['.name']))
			names.push(section['.name']);
	});

	return names.sort();
}

function configuredDnsServers() {
	var servers = [];
	var globals = uci.sections('ipsec', 'ipsec');
	var interfaces = globals.length ? L.toArray(globals[0].interface) : [];

	for (var i = 0; i < interfaces.length; i++) {
		if (!isSelectableUplink(interfaces[i]))
			continue;

		servers = L.toArray(uci.get('network', interfaces[i], 'dns'));
		if (servers.length)
			return servers;

		var address = uci.get('network', interfaces[i], 'ipaddr');
		if (address)
			return [ String(address).replace(/\/.*/, '') ];
	}

	return [];
}

function addInterfaceValues(o) {
	var names = interfaceNames();

	names.forEach(function(name) {
		o.value(name, name);
	});

	o.validate = function(section_id, value) {
		var name = L.toArray(value)[0];

		return name && names.indexOf(name) >= 0
			? true
			: _('Select an existing non-VPN network interface.');
	};

	return names;
}

function sectionNames(type, predicate) {
	var names = [];

	uci.sections('ipsec', type, function(section) {
		if (!predicate || predicate(section))
			names.push(section['.name']);
	});

	return names.sort();
}

function addSectionReferences(o, type, predicate, error) {
	var names = sectionNames(type, predicate);

	names.forEach(function(name) {
		o.value(name, name);
	});

	o.create = false;
	o.forcewrite = true;
	o.write = function(section_id, value) {
		var values = L.toArray(value);

		if (!values.length)
			throw new TypeError(error);

		for (var i = 0; i < values.length; i++) {
			var section = uci.get('ipsec', values[i]);
			if (!section || section['.type'] != type || (predicate && !predicate(section)))
				throw new TypeError(error);
		}

		return this.super('write', [ section_id, values ]);
	};
}

function certificateChoices(data) {
	var choices = (data || {}).choices || {};
	var pairs = choices.server_credentials || [];
	var authorities = choices.ca_certificates || [];

	if (!pairs.length)
		pairs = [ { name: 'server', cert: 'serverCert.pem', key: 'serverKey.pem', identifiers: [], missing: true } ];
	if (!authorities.length)
		authorities = [ 'caCert.pem' ];

	pairs.forEach(function(pair) {
		pair.identifiers = L.toArray(pair.identifiers);
		pair.preferred_identifier = pair.preferred_identifier || pair.identifiers[0] || '';
	});

	return {
		server: pairs,
		ca: authorities
	};
}

function addServerCertificate(o, credentials) {
	var keys = {};

	credentials.server.forEach(function(pair) {
		keys[pair.cert] = pair.key;
		o.value(pair.cert, pair.missing
			? _('%s (not generated)').format(pair.cert)
			: (pair.preferred_identifier ? '%s — %s'.format(pair.cert, pair.preferred_identifier) : pair.cert));
	});

	o.default = credentials.server[0].cert;
	o.rmempty = false;
	o.forcewrite = true;
	o.write = function(section_id, value) {
		var result = this.super('write', [ section_id, value ]);

		if (keys[value])
			uci.set('ipsec', section_id, 'local_key', keys[value]);

		return result;
	};
}

function addServerIdentifier(o, credentials) {
	var byCertificate = {};
	var identifiers = [];

	credentials.server.forEach(function(pair) {
		byCertificate[pair.cert] = pair.identifiers;
		pair.identifiers.forEach(function(identifier) {
			if (identifiers.indexOf(identifier) < 0) {
				identifiers.push(identifier);
				o.value(identifier, identifier);
			}
		});
	});

	o.default = credentials.server[0].preferred_identifier || identifiers[0] || null;
	o.rmempty = false;
	o.forcewrite = true;
	o.validate = function(section_id, value) {
		var cert = uci.get('ipsec', section_id, 'local_cert') || credentials.server[0].cert;
		var allowed = byCertificate[cert] || [];

		return allowed.indexOf(value) >= 0
			? true
			: _('Select an identity contained in the selected server certificate.');
	};

	return identifiers.length;
}

function addRemoteOptions(s, auth, credentials) {
	var o;

	o = s.option(form.Flag, 'enabled', _('Enable responder'));
	o.default = '0';
	o.rmempty = false;

	o = s.option(form.Value, 'gateway', _('Gateway'));
	o.default = 'any';
	o.rmempty = false;

	o = s.option(form.HiddenValue, 'authentication_method', null, null);
	fixedValue(o, auth == 'eap' ? 'eap-mschapv2' : 'pubkey');

	o = s.option(form.ListValue, 'local_cert', _('Server certificate'));
	addServerCertificate(o, credentials);

	o = s.option(form.DummyValue, '_local_key', _('Server private key'));
	o.cfgvalue = function(section_id) {
		return uci.get('ipsec', section_id, 'local_key') || _('Not configured');
	};
	o.description = _('Automatically selected to match the server certificate.');

	if (credentials.server.some(function(pair) { return pair.identifiers.length > 0; })) {
		o = s.option(form.ListValue, 'local_identifier', _('Local identifier'));
		addServerIdentifier(o, credentials);
		o.description = _('Select an identity contained in the selected server certificate.');
	} else {
		o = s.option(form.Value, 'local_identifier', _('Local identifier'));
		o.placeholder = 'vpn.example.net';
		o.rmempty = true;
		o.description = _('Generate or select a server certificate before enabling this responder.');
	}

	if (auth == 'pubkey') {
		o = s.option(form.MultiValue, 'remote_ca_certs', _('CA certificates'));
		credentials.ca.forEach(function(cert) { o.value(cert, cert); });
		o.create = false;
		o.default = [ credentials.ca[0] ];
		o.rmempty = false;
	} else {
		o = s.option(form.Value, 'eap_id', _('EAP identity'));
		o.default = '%any';
		o.rmempty = false;
		o.description = _('Matches EAP usernames; %any accepts all configured EAP users.');
	}

	o = s.option(form.MultiValue, 'crypto_proposal', _('IKE proposals'));
	addSectionReferences(o, 'crypto_proposal', function(section) { return !!section.prf_algorithm; }, _('Select an existing IKE proposal.'));
	o.default = [ 'ike_proposal' ];
	o.rmempty = false;

	o = s.option(form.MultiValue, 'tunnel', _('Child tunnels'));
	addSectionReferences(o, 'tunnel', null, _('Select an existing child tunnel.'));
	o.default = [ 'rw_child' ];
	o.rmempty = false;

	o = s.option(form.MultiValue, 'pools', _('Address pools'));
	addSectionReferences(o, 'pools', null, _('Select an existing address pool.'));
	o.default = [ 'primaryipv4' ];
	o.rmempty = false;

	o = s.option(form.Value, 'rekeytime', _('IKE rekey time'));
	o.default = '4h';
	o.rmempty = false;

	o = s.option(form.Value, 'keyingtries', _('Keying tries'));
	o.default = '0';
	o.rmempty = false;

	o = s.option(form.Flag, 'mobike', _('MOBIKE'));
	o.default = '1';
	o.rmempty = false;
	o.description = _('Allow clients to roam between networks without reconnecting.');

	o = s.option(form.ListValue, 'send_cert', _('Send certificate'));
	o.value('always', _('Always'));
	o.value('ifasked', _('If requested'));
	o.value('never', _('Never'));
	o.default = 'always';
	o.rmempty = false;

	o = s.option(form.Flag, 'send_certreq', _('Send certificate request'));
	o.default = auth == 'eap' ? '0' : '1';
	o.rmempty = false;

	o = s.option(form.Flag, 'fragmentation', _('IKE fragmentation'));
	o.default = '1';
	o.rmempty = false;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('network'),
			uci.load('ipsec'),
			L.resolveDefault(callListCerts(), {})
		]);
	},

	render: function(data) {
		var m, s, o, dnsServers;
		var credentials = certificateChoices(data[2]);
		dnsServers = configuredDnsServers();

		m = new form.Map('ipsec', _('Server Settings'),
			_('Configure the IKEv2 responder, identity, XFRM interface, and client address pool.'));
		m.chain('network');

		s = m.section(form.TypedSection, 'ipsec', _('Global IPsec Settings'));
		s.anonymous = true;
		s.addremove = false;
		s.description = _('Global strongSwan UCI settings. The service is disabled by default; enable it explicitly from the Overview page when the configuration is ready.');

		o = s.option(form.ListValue, 'interface', _('Uplink interface'));
		var uplinks = addInterfaceValues(o);
		o.default = uplinks[0] || null;
		o.rmempty = false;
		o.forcewrite = true;
		o.cfgvalue = function(section_id) {
			return L.toArray(uci.get('ipsec', section_id, 'interface'))[0] || null;
		};
		o.description = _('The selected interface is the VPN uplink. Saving this page also updates the XFRM tunnel link.');
		o.write = function(section_id, value) {
			var vpn = uci.get('network', 'vpn');
			var result = this.super('write', [ section_id, value ]);

			/* Preserve the strongSwan UCI list representation. */
			uci.set('ipsec', section_id, 'interface', [ value ]);
			if (value && vpn && vpn['.type'] == 'interface')
				uci.set('network', 'vpn', 'tunlink', value);

			return result;
		};

		o = s.option(form.Value, 'zone', _('VPN firewall zone'));
		o.default = 'vpn';
		o.datatype = 'uciname';
		o.rmempty = false;
		o.forcewrite = true;
		o.description = _('Saving this page also updates the XFRM interface firewall zone.');
		o.write = function(section_id, value) {
			var vpn = uci.get('network', 'vpn');
			var result = this.super('write', [ section_id, value ]);

			if (vpn && vpn['.type'] == 'interface')
				uci.set('network', 'vpn', 'zone', value);

			return result;
		};

		o = s.option(form.ListValue, 'debug', _('Debug level'));
		o.value('0', _('Quiet'));
		o.value('1', _('Basic'));
		o.value('2', _('Verbose'));
		o.default = '1';
		o.rmempty = false;

		s = m.section(form.NamedSection, 'rw_pubkey', 'remote', _('Road-Warrior Remote'));
		s.addremove = true;
		s.addbtntitle = _('Create road-warrior remote');
		s.description = _('UCI section: remote rw_pubkey. This profile uses certificate public-key authentication.');
		addRemoteOptions(s, 'pubkey', credentials);

		s = m.section(form.NamedSection, 'rw_eap', 'remote', _('Road-Warrior EAP Remote'));
		s.addremove = true;
		s.addbtntitle = _('Create EAP remote');
		s.description = _('UCI section: remote rw_eap. This profile uses EAP-MSCHAPv2 username/password authentication with the server certificate.');
		addRemoteOptions(s, 'eap', credentials);

		s = m.section(form.NamedSection, 'primaryipv4', 'pools', _('Client Address Pool'));
		s.addremove = true;
		s.addbtntitle = _('Create address pool');
		s.description = _('UCI section: pools primaryipv4.');

		o = s.option(form.Value, 'addrs', _('Client pool'));
		o.default = '10.0.2.2-10.0.2.64';
		o.rmempty = false;

		o = s.option(form.DynamicList, 'dns', _('DNS servers'));
		o.datatype = 'ipaddr';
		if (dnsServers.length)
			o.default = dnsServers;
		o.rmempty = true;

		s = m.section(form.NamedSection, 'rw_child', 'tunnel', _('Child Tunnel'));
		s.addremove = true;
		s.addbtntitle = _('Create child tunnel');
		s.description = _('UCI section: tunnel rw_child. Local subnets define what routes clients receive.');

		o = s.option(form.DynamicList, 'local_subnet', _('Local subnets'));
		o.default = [ '0.0.0.0/0' ];
		o.datatype = 'cidr4';
		o.rmempty = false;

		o = s.option(form.DummyValue, '_if_id', _('XFRM if_id'));
		o.cfgvalue = function() {
			return uci.get('network', 'vpn', 'ifid') || uci.get('ipsec', 'rw_child', 'if_id') || _('Not configured');
		};
		o.description = _('Derived from the XFRM interface ID when this page is saved.');

		o = s.option(form.Value, 'rekeytime', _('CHILD rekey time'));
		o.default = '1h';
		o.rmempty = false;

		o = s.option(form.ListValue, 'startaction', _('Start action'));
		o.value('none', _('None'));
		o.value('trap', _('Trap'));
		o.value('start', _('Start'));
		o.default = 'none';
		o.rmempty = false;

		o = s.option(form.ListValue, 'closeaction', _('Close action'));
		o.value('none', _('None'));
		o.value('trap', _('Trap'));
		o.value('start', _('Start'));
		o.default = 'none';
		o.rmempty = false;

		s = m.section(form.NamedSection, 'vpn', 'interface', _('XFRM Interface'));
		s.uciconfig = 'network';
		s.addremove = true;
		s.addbtntitle = _('Create XFRM interface');
		s.description = _('UCI section: network interface vpn. This section is created only when explicitly saved from this page.');

		o = s.option(form.HiddenValue, 'proto', null, null);
		o.default = 'xfrm';
		o.rmempty = false;
		o.forcewrite = true;
		o.cfgvalue = function() { return 'xfrm'; };

		o = s.option(form.Value, 'ifid', _('if_id'));
		o.default = '357';
		o.datatype = 'range(1,4294967295)';
		o.rmempty = false;
		o.forcewrite = true;
		o.description = _('This value is also written to the child tunnel XFRM if_id.');
		o.write = function(section_id, value) {
			var child = uci.get('ipsec', 'rw_child');
			var result = this.super('write', [ section_id, value ]);

			if (child && child['.type'] == 'tunnel')
				uci.set('ipsec', 'rw_child', 'if_id', value);

			return result;
		};

		o = s.option(form.DummyValue, '_tunlink', _('Tunnel link'));
		o.cfgvalue = function() {
			return uci.get('network', 'vpn', 'tunlink') || _('Not configured');
		};
		o.description = _('Derived from the selected uplink interface when this page is saved.');

		o = s.option(form.Value, 'mtu', _('MTU'));
		o.default = '1438';
		o.datatype = 'range(576,9200)';
		o.rmempty = false;

		o = s.option(form.DummyValue, '_zone', _('Firewall zone'));
		o.cfgvalue = function() {
			return uci.get('network', 'vpn', 'zone') || _('Not configured');
		};
		o.description = _('Derived from the global VPN firewall zone when this page is saved.');

		s = m.section(form.NamedSection, 'vpn_vip', 'interface', _('VPN Gateway Address'));
		s.uciconfig = 'network';
		s.addremove = true;
		s.addbtntitle = _('Create VPN gateway address');
		s.description = _('UCI section: network interface vpn_vip.');

		o = s.option(form.HiddenValue, 'proto', null, null);
		o.default = 'static';
		o.rmempty = false;
		o.forcewrite = true;
		o.cfgvalue = function() { return 'static'; };

		o = s.option(form.Value, 'ipaddr', _('VPN gateway'));
		o.default = '10.0.2.1/24';
		o.datatype = 'cidr4';
		o.rmempty = false;

		o = s.option(form.HiddenValue, 'device', null, null);
		fixedValue(o, '@vpn');

		return m.render();
	}
});
