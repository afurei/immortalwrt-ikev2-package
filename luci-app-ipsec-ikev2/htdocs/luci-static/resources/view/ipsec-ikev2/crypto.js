'use strict';
'require form';
'require uci';
'require ui';
'require view';

function valueSet(o, values, def) {
	for (var i = 0; i < values.length; i++)
		o.value(values[i]);
	o.default = def || values[0];
	o.rmempty = false;
}

function ensureSection(type, sid) {
	if (!uci.get('ipsec', sid))
		uci.add('ipsec', type, sid);
}

function addProposalReferences(o, predicate) {
	uci.sections('ipsec', 'crypto_proposal', function(section) {
		if (!predicate || predicate(section))
			o.value(section['.name'], section['.name']);
	});

	o.create = false;
	o.forcewrite = true;
	o.write = function(section_id, value) {
		var values = L.toArray(value);

		if (!values.length)
			throw new TypeError(_('Select an existing ESP proposal.'));

		for (var i = 0; i < values.length; i++) {
			var section = uci.get('ipsec', values[i]);
			if (!section || section['.type'] != 'crypto_proposal' || (predicate && !predicate(section)))
				throw new TypeError(_('Select an existing ESP proposal.'));
		}

		return this.super('write', [ section_id, values ]);
	};
}

function setModernDefaults() {
	ensureSection('crypto_proposal', 'ike_proposal');
	ensureSection('tunnel', 'rw_child');
	ensureSection('crypto_proposal', 'esp_proposal');
	ensureSection('crypto_proposal', 'esp_proposal_legacy');

	uci.set('ipsec', 'ike_proposal', 'encryption_algorithm', 'aes256gcm');
	uci.set('ipsec', 'ike_proposal', 'dh_group', 'modp2048');
	uci.set('ipsec', 'ike_proposal', 'prf_algorithm', 'prfsha256');

	uci.set('ipsec', 'rw_child', 'local_subnet', [ '0.0.0.0/0' ]);
	if (uci.get('network', 'vpn', 'ifid'))
		uci.set('ipsec', 'rw_child', 'if_id', uci.get('network', 'vpn', 'ifid'));
	uci.set('ipsec', 'rw_child', 'rekeytime', '1h');
	uci.set('ipsec', 'rw_child', 'startaction', 'none');
	uci.set('ipsec', 'rw_child', 'closeaction', 'none');
	uci.set('ipsec', 'rw_child', 'crypto_proposal', [ 'esp_proposal' ]);

	uci.set('ipsec', 'esp_proposal', 'encryption_algorithm', 'aes256gcm');
	uci.set('ipsec', 'esp_proposal', 'dh_group', 'modp2048');
	uci.unset('ipsec', 'esp_proposal', 'hash_algorithm');

	uci.set('ipsec', 'esp_proposal_legacy', 'enabled', '0');
	uci.set('ipsec', 'esp_proposal_legacy', 'encryption_algorithm', 'aes256');
	uci.set('ipsec', 'esp_proposal_legacy', 'hash_algorithm', 'sha256');
	uci.set('ipsec', 'esp_proposal_legacy', 'dh_group', 'modp2048');

	return uci.save().then(function() {
		ui.addTimeLimitedNotification(null, E('p', _('Modern IPsec defaults have been staged. Use Save & Apply to commit and apply the changes.')), 5000, 'info');
		window.setTimeout(function() { window.location.reload(); }, 600);
	});
}

function proposalPreview() {
	return E('div', { 'class': 'cbi-section' }, [
		E('h3', {}, _('Proposal Preview')),
		E('p', { 'class': 'cbi-section-descr' }, _('The table summarizes the intended default profile. The editable UCI values are above.')),
		E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Section')),
				E('th', { 'class': 'th' }, _('Encryption')),
				E('th', { 'class': 'th' }, _('Integrity / PRF')),
				E('th', { 'class': 'th' }, _('DH')),
				E('th', { 'class': 'th' }, _('Status'))
			]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, 'ike_proposal'), E('td', { 'class': 'td' }, 'aes256gcm'), E('td', { 'class': 'td' }, 'prfsha256'), E('td', { 'class': 'td' }, 'modp2048'), E('td', { 'class': 'td' }, _('modern')) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, 'esp_proposal'), E('td', { 'class': 'td' }, 'aes256gcm'), E('td', { 'class': 'td' }, 'AEAD'), E('td', { 'class': 'td' }, 'modp2048'), E('td', { 'class': 'td' }, _('modern')) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, 'esp_proposal_legacy'), E('td', { 'class': 'td' }, 'aes256'), E('td', { 'class': 'td' }, 'sha256'), E('td', { 'class': 'td' }, 'modp2048'), E('td', { 'class': 'td' }, _('disabled')) ])
		])
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('ipsec'),
			uci.load('network')
		]);
	},

	render: function() {
		var m, s, o;

		m = new form.Map('ipsec', _('Crypto Proposals'),
			_('Tune IKE and ESP proposals for modern clients while keeping an optional legacy profile available.'));
		m.chain('network');

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			return E('div', { 'class': 'cbi-section' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function(ev) {
						ev.preventDefault();
						return setModernDefaults();
					}
				}, _('Modern defaults')),
				E('p', { 'class': 'cbi-section-descr' }, _('Stage recommended aes256gcm/prfsha256/modp2048 values without enabling the legacy proposal.'))
			]);
		};

		s = m.section(form.NamedSection, 'ike_proposal', 'crypto_proposal', _('IKE Proposal'));
		s.addremove = true;
		s.addbtntitle = _('Create IKE proposal');
		s.description = _('UCI section: crypto_proposal ike_proposal.');

		o = s.option(form.ListValue, 'encryption_algorithm', _('Encryption'));
		valueSet(o, [ 'aes256gcm', 'aes128gcm', 'aes256' ], 'aes256gcm');

		o = s.option(form.ListValue, 'prf_algorithm', _('PRF'));
		valueSet(o, [ 'prfsha256', 'prfsha384', 'prfsha512' ], 'prfsha256');

		o = s.option(form.ListValue, 'dh_group', _('DH group'));
		valueSet(o, [ 'modp2048', 'modp3072', 'ecp256' ], 'modp2048');

		s = m.section(form.NamedSection, 'rw_child', 'tunnel', _('Child Tunnel Crypto Binding'));
		s.addremove = true;
		s.addbtntitle = _('Create child tunnel');
		s.description = _('The child tunnel references one or more ESP proposals.');

		o = s.option(form.MultiValue, 'crypto_proposal', _('ESP proposals'));
		addProposalReferences(o, function(section) { return !section.prf_algorithm; });
		o.default = [ 'esp_proposal' ];
		o.rmempty = false;

		o = s.option(form.DynamicList, 'local_subnet', _('Local subnets'));
		o.default = [ '0.0.0.0/0' ];
		o.datatype = 'cidr4';
		o.rmempty = false;

		o = s.option(form.DummyValue, '_if_id', _('XFRM if_id'));
		o.cfgvalue = function() {
			return uci.get('network', 'vpn', 'ifid') || uci.get('ipsec', 'rw_child', 'if_id') || _('Not configured');
		};
		o.description = _('Derived from the XFRM interface ID on the Server page.');

		o = s.option(form.Value, 'rekeytime', _('CHILD rekey time'));
		o.default = '1h';
		o.rmempty = false;

		s = m.section(form.NamedSection, 'esp_proposal', 'crypto_proposal', _('ESP Proposal'));
		s.addremove = true;
		s.addbtntitle = _('Create ESP proposal');
		s.description = _('UCI section: crypto_proposal esp_proposal. AEAD algorithms such as aes256gcm do not need a hash algorithm.');

		o = s.option(form.ListValue, 'encryption_algorithm', _('Encryption'));
		valueSet(o, [ 'aes256gcm', 'aes128gcm', 'chacha20poly1305', 'aes256' ], 'aes256gcm');

		o = s.option(form.ListValue, 'hash_algorithm', _('Hash'));
		o.value('', _('None / AEAD'));
		o.value('sha256', 'sha256');
		o.value('sha384', 'sha384');
		o.default = '';
		o.rmempty = true;

		o = s.option(form.ListValue, 'dh_group', _('DH group'));
		valueSet(o, [ 'modp2048', 'modp3072', 'none' ], 'modp2048');

		s = m.section(form.NamedSection, 'esp_proposal_legacy', 'crypto_proposal', _('Legacy ESP Proposal'));
		s.addremove = true;
		s.addbtntitle = _('Create legacy ESP proposal');
		s.description = _('Optional compatibility profile. It is not referenced by the child tunnel unless explicitly added above.');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.ListValue, 'encryption_algorithm', _('Encryption'));
		valueSet(o, [ 'aes256', 'aes128' ], 'aes256');

		o = s.option(form.ListValue, 'hash_algorithm', _('Hash'));
		valueSet(o, [ 'sha256', 'sha384' ], 'sha256');

		o = s.option(form.ListValue, 'dh_group', _('DH group'));
		valueSet(o, [ 'modp2048', 'modp1024' ], 'modp2048');

		return Promise.resolve(m.render()).then(function(rendered) {
			rendered.appendChild(proposalPreview());
			return rendered;
		});
	}
});
