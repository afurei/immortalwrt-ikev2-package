'use strict';

const assert = require('assert');
const fs = require('fs');

const viewDirectory = process.argv[2] || 'htdocs/luci-static/resources/view/ipsec-ikev2';

if (!String.prototype.format) {
	Object.defineProperty(String.prototype, 'format', {
		value(...values) {
			let index = 0;
			return this.replace(/%s/g, () => String(values[index++]));
		}
	});
}

const state = {
	network: {
		loopback: { '.name': 'loopback', '.type': 'interface', proto: 'static' },
		lan: { '.name': 'lan', '.type': 'interface', proto: 'static', ipaddr: '192.168.2.77', dns: [ '192.168.2.10' ] },
		vpn: { '.name': 'vpn', '.type': 'interface', proto: 'xfrm', ifid: '357', tunlink: 'lan', zone: 'vpn' },
		vpn_vip: { '.name': 'vpn_vip', '.type': 'interface', proto: 'static', ipaddr: '10.0.2.1/24' }
	},
	ipsec: {
		cfg_ipsec: { '.name': 'cfg_ipsec', '.type': 'ipsec', interface: [ 'lan' ], zone: 'vpn', debug: '1' },
		rw_pubkey: { '.name': 'rw_pubkey', '.type': 'remote', local_cert: 'serverCert.pem', local_identifier: 'vpn.test.example', crypto_proposal: [ 'ike_proposal' ], tunnel: [ 'rw_child' ], pools: [ 'primaryipv4' ] },
		rw_eap: { '.name': 'rw_eap', '.type': 'remote', crypto_proposal: [ 'ike_proposal' ], tunnel: [ 'rw_child' ], pools: [ 'primaryipv4' ] },
		ike_proposal: { '.name': 'ike_proposal', '.type': 'crypto_proposal', prf_algorithm: 'prfsha256' },
		rw_child: { '.name': 'rw_child', '.type': 'tunnel', crypto_proposal: [ 'esp_proposal' ], if_id: '357' },
		esp_proposal: { '.name': 'esp_proposal', '.type': 'crypto_proposal' },
		esp_proposal_legacy: { '.name': 'esp_proposal_legacy', '.type': 'crypto_proposal', enabled: '0' },
		primaryipv4: { '.name': 'primaryipv4', '.type': 'pools' }
	}
};

const L = {
	toArray(value) {
		if (value == null || value === '')
			return [];
		return Array.isArray(value) ? value.slice() : [ value ];
	},
	resolveDefault(value, fallback) {
		return Promise.resolve(value).catch(() => fallback);
	}
};

const uci = {
	load(config) {
		return Promise.resolve(config);
	},
	get(config, section, option) {
		const object = state[config] && state[config][section];
		if (!object)
			return null;
		return option == null ? object : object[option];
	},
	set(config, section, option, value) {
		state[config] = state[config] || {};
		state[config][section] = state[config][section] || { '.name': section };
		state[config][section][option] = Array.isArray(value) ? value.slice() : value;
		return null;
	},
	unset(config, section, option) {
		if (state[config] && state[config][section])
			delete state[config][section][option];
	},
	add(config, type, section) {
		state[config][section] = { '.name': section, '.type': type };
		return section;
	},
	sections(config, type, callback) {
		const sections = Object.values(state[config] || {}).filter(section => !type || section['.type'] === type);
		if (callback)
			sections.forEach(callback);
		return sections;
	},
	save() {
		return Promise.resolve();
	}
};

function token(name) {
	return { kind: name };
}

const maps = [];
class MapModel {
	constructor(config) {
		this.config = config;
		this.sections = [];
		maps.push(this);
	}
	chain() {}
	section(sectionClass, sectionId, sectionType, title) {
		const map = this;
		const section = {
			kind: sectionClass.kind,
			sectionId,
			sectionType,
			title,
			children: [],
			option(optionClass, name, optionTitle) {
				const option = {
					kind: optionClass.kind,
					option: name,
					title: optionTitle,
					section,
					map,
					choices: [],
					value(value, label) {
						this.choices.push({ value, label });
					},
					super(method, args) {
						assert.strictEqual(method, 'write');
						const config = this.uciconfig || section.uciconfig || map.config;
						return uci.set(config, args[0], this.ucioption || this.option, args[1]);
					}
				};
				section.children.push(option);
				return option;
			}
		};
		this.sections.push(section);
		return section;
	}
	render() {
		return { appendChild() {} };
	}
}

const form = {
	Map: MapModel,
	TypedSection: token('TypedSection'),
	NamedSection: token('NamedSection'),
	Value: token('Value'),
	ListValue: token('ListValue'),
	MultiValue: token('MultiValue'),
	DynamicList: token('DynamicList'),
	DummyValue: token('DummyValue'),
	HiddenValue: token('HiddenValue'),
	Flag: token('Flag')
};

const rpc = {
	declare(spec) {
		if (spec.method === 'list_certs') {
			return () => Promise.resolve({
				choices: {
					server_credentials: [ {
						cert: 'serverCert.pem',
						key: 'serverKey.pem',
						preferred_identifier: 'vpn.test.example',
						identifiers: [ 'vpn.test.example' ]
					} ],
					ca_certificates: [ 'caCert.pem' ]
				}
			});
		}
		return () => Promise.resolve({});
	}
};

const ui = { addNotification() {} };
const view = { extend(object) { return object; } };
function E() { return { appendChild() {}, replaceChildren() {} }; }
function _(text) { return text; }

function loadView(path, dependencies) {
	const code = fs.readFileSync(path, 'utf8');
	const names = Object.keys(dependencies);
	const values = names.map(name => dependencies[name]);
	return Function(...names, code)(...values);
}

function options(map, name) {
	return map.sections.flatMap(section => section.children).filter(option => !name || option.option === name);
}

function optionIn(map, sectionId, name) {
	const section = map.sections.find(item => item.sectionId === sectionId);
	assert(section, `missing section ${sectionId}`);
	const option = section.children.find(item => item.option === name);
	assert(option, `missing option ${sectionId}.${name}`);
	return option;
}

async function main() {
	const server = loadView(`${viewDirectory}/server.js`, { form, rpc, uci, view, L, E, _ });
	const serverData = await server.load();
	await server.render(serverData);
	const serverMap = maps.shift();

	const uplink = options(serverMap, 'interface')[0];
	assert.strictEqual(uplink.kind, 'ListValue');
	assert.deepStrictEqual(uplink.choices.map(choice => choice.value), [ 'lan' ]);
	assert.strictEqual(uplink.cfgvalue('cfg_ipsec'), 'lan');
	assert.strictEqual(uplink.validate('cfg_ipsec', 'lan'), true);
	assert.notStrictEqual(uplink.validate('cfg_ipsec', 'vpn'), true);
	uplink.write('cfg_ipsec', 'lan');
	assert.deepStrictEqual(state.ipsec.cfg_ipsec.interface, [ 'lan' ]);
	assert.strictEqual(state.network.vpn.tunlink, 'lan');

	for (const name of [ 'crypto_proposal', 'tunnel', 'pools' ]) {
		for (const reference of options(serverMap, name)) {
			assert.strictEqual(reference.kind, 'MultiValue');
			assert.strictEqual(reference.create, false);
			assert.strictEqual(reference.forcewrite, true);
			assert.strictEqual(typeof reference.validate, 'undefined');
			assert.strictEqual(typeof reference.write, 'function');
		}
	}

	for (const dynamic of options(serverMap).filter(option => option.kind === 'DynamicList')) {
		assert.strictEqual(typeof dynamic.validate, 'undefined');
		assert([ 'ipaddr', 'cidr4' ].includes(dynamic.datatype));
	}

	assert.strictEqual(optionIn(serverMap, 'rw_pubkey', 'local_cert').kind, 'ListValue');
	assert.strictEqual(optionIn(serverMap, 'rw_pubkey', '_local_key').kind, 'DummyValue');
	const localIdentifier = optionIn(serverMap, 'rw_pubkey', 'local_identifier');
	assert.strictEqual(localIdentifier.kind, 'ListValue');
	assert.deepStrictEqual(localIdentifier.choices.map(choice => choice.value), [ 'vpn.test.example' ]);
	assert.strictEqual(localIdentifier.validate('rw_pubkey', 'vpn.test.example'), true);
	assert.notStrictEqual(localIdentifier.validate('rw_pubkey', 'vpn.example.net'), true);
	assert.strictEqual(optionIn(serverMap, 'rw_pubkey', 'remote_ca_certs').create, false);
	assert.strictEqual(optionIn(serverMap, 'rw_child', '_if_id').kind, 'DummyValue');
	assert.strictEqual(optionIn(serverMap, 'vpn', 'proto').kind, 'HiddenValue');
	assert.strictEqual(optionIn(serverMap, 'vpn_vip', 'proto').kind, 'HiddenValue');
	assert.strictEqual(optionIn(serverMap, 'vpn_vip', 'device').kind, 'HiddenValue');

	const crypto = loadView(`${viewDirectory}/crypto.js`, { form, uci, ui, view, L, E, _ });
	await crypto.load();
	await crypto.render();
	const cryptoMap = maps.shift();
	const espReference = optionIn(cryptoMap, 'rw_child', 'crypto_proposal');
	assert.strictEqual(espReference.kind, 'MultiValue');
	assert.strictEqual(espReference.create, false);
	assert.strictEqual(espReference.forcewrite, true);
	assert.strictEqual(typeof espReference.validate, 'undefined');
	espReference.write('rw_child', [ 'esp_proposal' ]);
	assert.deepStrictEqual(state.ipsec.rw_child.crypto_proposal, [ 'esp_proposal' ]);
	assert.throws(() => espReference.write('rw_child', [ 'ike_proposal' ]), /Select an existing ESP proposal/);
	assert.strictEqual(optionIn(cryptoMap, 'rw_child', '_if_id').kind, 'DummyValue');

	console.log('form_model=PASS');
}

main().catch(error => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
