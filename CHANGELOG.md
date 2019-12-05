# Changelog

## [2.2.0](https://www.github.com/googleapis/gaxios/compare/v2.1.1...v2.2.0) (2019-12-05)


### Features

* populate GaxiosResponse with raw response information (res.url) ([#189](https://www.github.com/googleapis/gaxios/issues/189)) ([53a7f54](https://www.github.com/googleapis/gaxios/commit/53a7f54cc0f20320d7a6a21a9a9f36050cec2eec))


### Bug Fixes

* don't retry a request that is aborted intentionally ([#190](https://www.github.com/googleapis/gaxios/issues/190)) ([ba9777b](https://www.github.com/googleapis/gaxios/commit/ba9777b15b5262f8288a8bb3cca49a1de8427d8e))
* **deps:** pin TypeScript below 3.7.0 ([5373f07](https://www.github.com/googleapis/gaxios/commit/5373f0793a765965a8221ecad2f99257ed1b7444))

### [2.1.1](https://www.github.com/googleapis/gaxios/compare/v2.1.0...v2.1.1) (2019-11-15)


### Bug Fixes

* **docs:** snippets are now replaced in jsdoc comments ([#183](https://www.github.com/googleapis/gaxios/issues/183)) ([8dd1324](https://www.github.com/googleapis/gaxios/commit/8dd1324256590bd2f2e9015c813950e1cd8cb330))

## [2.1.0](https://www.github.com/googleapis/gaxios/compare/v2.0.3...v2.1.0) (2019-10-09)


### Bug Fixes

* **deps:** update dependency https-proxy-agent to v3 ([#172](https://www.github.com/googleapis/gaxios/issues/172)) ([4a38f35](https://www.github.com/googleapis/gaxios/commit/4a38f35))


### Features

* **TypeScript:** agent can now be passed as builder method, rather than agent instance ([c84ddd6](https://www.github.com/googleapis/gaxios/commit/c84ddd6))

### [2.0.3](https://www.github.com/googleapis/gaxios/compare/v2.0.2...v2.0.3) (2019-09-11)


### Bug Fixes

* do not override content-type if its given ([#158](https://www.github.com/googleapis/gaxios/issues/158)) ([f49e0e6](https://www.github.com/googleapis/gaxios/commit/f49e0e6))
* improve stream detection logic ([6c41537](https://www.github.com/googleapis/gaxios/commit/6c41537))
* revert header change ([#161](https://www.github.com/googleapis/gaxios/issues/161)) ([b0f6a8b](https://www.github.com/googleapis/gaxios/commit/b0f6a8b))

### [2.0.2](https://www.github.com/googleapis/gaxios/compare/v2.0.1...v2.0.2) (2019-07-23)


### Bug Fixes

* check for existence of fetch before using it ([#138](https://www.github.com/googleapis/gaxios/issues/138)) ([79eb58d](https://www.github.com/googleapis/gaxios/commit/79eb58d))
* **docs:** make anchors work in jsdoc ([#139](https://www.github.com/googleapis/gaxios/issues/139)) ([85103bb](https://www.github.com/googleapis/gaxios/commit/85103bb))
* prevent double option processing ([#142](https://www.github.com/googleapis/gaxios/issues/142)) ([19b4b3c](https://www.github.com/googleapis/gaxios/commit/19b4b3c))
