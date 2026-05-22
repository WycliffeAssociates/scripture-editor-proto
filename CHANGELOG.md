# Changelog

## [0.3.0](https://github.com/WycliffeAssociates/scripture-editor-proto/compare/v0.2.0...v0.3.0) (2026-05-22)


### ⚠ BREAKING CHANGES

* **core:** adopt typed library items and packed TN imports

### Features

* **1.1:** add cursor correction helper functions to USFMPlugin.tsx ([cbbd815](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cbbd815ca14ec79eba8902c917e5f1900ef08926))
* **1.2:** register cursor correction listener in USFMPlugin.tsx useEffect ([5f881a1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5f881a1a1e88835bf972519052f24635d7324c01))
* **1.3:** make cursor correction tests pass ([41d841d](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/41d841d6c3c2ef25353280a5ca53d8035d9075f9))
* **2.1:** create test helper functions for editor testing ([7477084](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7477084b8aad6100db3e96f612cb842c8aeb9a3f))
* **2.2:** write failing unit tests for cursor correction ([7b982d7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7b982d7eeb45aba1ac957d8f547fd36bbfb0c3b5))
* **4.4:** Create ProjectIndexer service in app domain ([4a23432](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4a23432d4c960f11201ad898cceb5a9e7291cfeb))
* add auth session provider foundation ([a2d5921](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a2d5921f137d2e052260f31ad2b8f08439fb14d6))
* add cloud account import controls ([047e038](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/047e03822a4e0aef93c6e1be1e582d591e063fb9))
* add cloud project import source ([ae1ccbb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/ae1ccbbfca10f205f5f33ef69b1a679a6ea1dd29))
* add cloud status and sync controls ([b3593e8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b3593e821ca094a24074e9d3d244d7baa399be99))
* add local save and publish coordination ([540e3bc](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/540e3bce3fa86ae00fb5a8333d618d152d049637))
* add remote compare source workflow ([821cfa9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/821cfa91e24ea8abd1b0b845ea298149b5ff5786))
* add remote inspection and publish plumbing ([479873f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/479873fdab485722195d0857e45434dbe79080a4))
* add remote replay plumbing ([6aee327](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6aee327652615d0c9e1993dc03a6d64124d0959f))
* add remote repo linking and clone flows ([0e4d0cd](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/0e4d0cd5acbdebe45934f6ab80d3c2bf8bf0b92d))
* add remote state foundations ([e63805b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e63805b9faadfaaff3e38947f9a38af1938e22b2))
* **core:** adopt typed library items and packed TN imports ([cd129d9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cd129d94b95eaf190a15bece777893f9010b86ee))
* **editor:** add flat token adapter for paragraph-tree structure ([5c394ff](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c394fff0987def9fc81e0bf0c44fa13b735229c))
* **editor:** build paragraph containers on parse ([59408dc](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/59408dc2373cfc67ee42173faf25cb431199903b))
* **editor:** explicit tree&lt;-&gt;flat transforms for mode switching ([f26068f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f26068fddc2a1a00f9c11cdbf4fdbb39044e7600))
* **editor:** handle backslash at start of verse to insert text node before marker ([a6db134](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a6db1345bb3dc68f0c1ae7779d9948008a207989))
* **editor:** implement Regular-mode paragraph insertion split-and-move (Task 7) ([6f80ede](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6f80edea2238becf56d61505042c08f7bd6209b9))
* **editor:** migrate prettify/search/matchFormatting to adapter (Task 11) ([041776f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/041776fbbc14e1fe7aacfa2517fea3a902911a45))
* **editor:** redirect Enter at start of verse to insert newline before marker ([c2fbfb3](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c2fbfb399e03279403e86de837d3955e44c10da2))
* **editor:** Regular-mode structural enforcement for paragraph containers ([6bafba9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6bafba9af6fb35b97b0ef1837d524ef68480f1f0))
* **editor:** remove inPara writes in Regular mode (Task 12) ([e423977](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e42397799d6dc6e506ffadfd7d330d82ae7774b8))
* **editor:** rename USFMElementNode to USFMParagraphNode ([b95e7f1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b95e7f16a17a8ec448fa7d0b7cee3f9a12ee0bbd))
* **editor:** simplify context menu modes to match settings presets ([a99ea8a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a99ea8a50e312d70d064c000063e08d9bf65487b))
* **editor:** simplify verse/chapter insertion to rely on structural integrity loop ([d9b19f7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/d9b19f71862cf7db8cc1c697d5ad66c138cd6a66))
* **editor:** stabilize runtime, fix USFM mode, finish Task 10 ([4d8b35a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4d8b35aa497d39f41716030240881b3dc0f44cd6))
* **editor:** update paragraphingUtils to use flat token adapter (Task 9) ([be80f6a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/be80f6afdc4493088dfa73caca21b451cd4b8c21))
* **editor:** use flat token adapter in serializeToUsfmString ([cef5e64](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cef5e6448d7dd0a1be1f6ac79e05e0a944364e16))
* extract DOM logic to useSearchHighlighter hook ([9481424](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/94814249d868f54ab038d69bb4f6abc4615130a8))
* extract search utilities to pure module ([fdd8dda](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/fdd8dda2b15c7604ab0204ece5a6196299ce5992)), closes [#2](https://github.com/WycliffeAssociates/scripture-editor-proto/issues/2)
* hydrate remote status on project open ([028d4a5](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/028d4a52a826ee2b69ac68814e1c0e70378aa62a))
* implement paragraphing mode mobile support and progress indicator ([82cd5ae](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/82cd5ae8ee8ef78939d5df8a12134abe77adeb4c))
* implement USFM prettify feature with book and project scopes ([7ab8742](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7ab874215d47812589c0f8cc36091c60bd4b16aa))
* **release:** channel-aware workflow + Cloudflare workers + R2 mirror ([7c508e3](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7c508e3f037f8e8fb8bb44bd2ce2e117b6b56d25))
* sanitize portable cloud project artifacts ([b44edde](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b44edde3f8f15e91cd7626e9ed8142281b4523be))
* **search:** auto-rerun on undo/redo + programmatic working-files commits ([8133681](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8133681976d8e3217b453c4a917ade3355fda73c))
* **ui:** style poetry by paragraph containers ([564c014](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/564c01463ab9d11c818cb0c029f9dc397ec91c3d))
* **updater:** Tauri auto-updater with banner, settings panel, and manual switch ([48f18b8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/48f18b82ce8acd45c88387c5e59ab9ff20561527))
* use linked session for save commit authorship ([330403a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/330403a7f0431afe480580e59aeb67868e8cf941))
* working-files store refactor + CI/CD release pipeline + Tauri auto-updater ([7bf47bb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7bf47bb0a1ad97956fa797d56c33bf68caa415e5))


### Bug Fixes

* **deps:** bump usfm-onion-web to v0.0.4 to keep WASM init in prod builds ([8f25a6c](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8f25a6cfad5f210e2a3c8a3d238a3ca7880cf283))
* **editor:** ensure verse and chapter numbers are always mutable ([1fcecca](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/1fceccab872ed17921eec2e7ca4a738419be3280))
* **editor:** improve orphaned numberRange cleanup and text conversion ([c347f05](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c347f05c9cbdf996615f28c1223fb2c0002caeb1))
* **editor:** restore editor focus after Action Palette closes ([f2280c1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f2280c1704c5e8f25295438e84d1feb83830d0e8))
* **editor:** unify copy logic with cut to respect selection boundaries ([44a703a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/44a703a337071d40393343deeadcc10069bef7e7))
* lint filter "all" re-expands when new codes/books arrive ([62ea993](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/62ea993d179e908279c844f5aa6871bbeecfc981))
* **lint:** re-calculate SIDs during existing token lint passes and fix SID bug ([40b4cd8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/40b4cd8605035a929a4c8cdbce8265c18dc73751))
* **prettify:** improve large project prettify notification and refactor hooks ([74bae1b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/74bae1ba26824273413c8ca19a2958acf97d9a3d))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([e33eeb2](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e33eeb2d4caf84bcfe1ffdb0287d681d76ae5936))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([cb4164b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cb4164bffcc99c075fa49f6c7b2e4b8a18997a72))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([4c24a87](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4c24a877c350f3d7e2231ba0058aa18e802cd987))
* refine prettify logic for poetry, chapters, and duplicates ([dc87a13](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/dc87a13ec31eaf440125501e0467db73178c4009))
* **regression:** fix unit tests for usfm-as-tree refactor ([61dc312](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/61dc31206a1187f8aa43fd54d0c761e3b4151b24))
* **release:** bump root wrangler to 4.94.0 to resolve CF API entitlements error ([f5dcd94](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f5dcd945c3016f79e0de1e47115ab8c95cc791b6))
* **release:** deploy-web actually deploys the updater worker now ([c16141c](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c16141cc359e32771bd0b48116ce08bd963b140d))
* **release:** drop component prefix from release tags ([0e83b3d](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/0e83b3d1ae38c330ebbd3bc1e9e4ceee930ec20a))
* **release:** nightly app_version order swap so MSI bundler accepts it ([091ca55](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/091ca5562635e66a9f45eb3a8baa234231b28788))
* **release:** nightly app_version uses a single numeric identifier for MSI ([b194cce](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b194cceef4a9c537af3ac322aec1bb93d03cca74))
* **release:** point updater worker at the real GH repo ([f283242](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f283242bb3395c41e53514b0a1895dc42cc75151))
* **updater:** worker target aliases, CORS, inline check status, popup containment ([05182c4](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/05182c4cc7ecb367c048caf3b79bb828365a242a))
* wrap ProjectView in ParagraphingProvider and add plugins to MainEditor ([9325821](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/9325821e4f0f948d0be249a43125adfd5d5e611a))


### Performance

* structural-sharing draft in undo/redo instead of full structuredClone ([8e894f8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8e894f859b53aedd95521ae3ec39a3044901021a))
* structural-sharing draftWithChapters for all working-files mutations ([c9c76a5](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c9c76a52c28eb3f459c4e1542c50e91f809eef55))


### Refactors

* **editor:** create hooks directory (ticket 5.1) ([c07e2eb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c07e2eba79ec6addf32f2fe6603a488f723d6e80))
* **editor:** extract useEditorInput hook (ticket 5.4) ([5c33700](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c33700e7c53bee3d47431fc02387857f55259d2))
* **editor:** extract useEditorLinter hook (ticket 5.2) ([b36dc49](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b36dc49effdb89aa1d955d3aec2eb4db4489557e))
* **editor:** extract useEditorStructure hook (ticket 5.3) ([43a1ff7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/43a1ff7593b84e5c39b339df2482b45823c86cde))
* Split USFMPlugin utilities to separate files for Fast Refresh compliance ([467fb15](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/467fb15e692254e9b39eda4139b579efe94c1004))
* **test:** pull integration coverage to the working-files store seam ([5c3dadb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c3dadbc8fdc5b780f1ffc45f4956a1245b9b798))


### Documentation

* **release:** release pipeline + updater topology spec ([6cdf6c6](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6cdf6c6ed235d372c54438c5c365c3a9b27660c1))
* **specs:** reflect store-seam architecture and search-rerun policy ([5867737](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/586773770af6aa4f8324fa6733eb77f9b3fab866))
* state architecture + editor data flow specs for the working-files refactor ([241b504](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/241b5047405c6fb4aa2584f2a08c18d638b83053))

## [0.2.0](https://github.com/WycliffeAssociates/scripture-editor-proto/compare/zephyr-v0.1.4...zephyr-v0.2.0) (2026-05-22)


### ⚠ BREAKING CHANGES

* **core:** adopt typed library items and packed TN imports

### Features

* **1.1:** add cursor correction helper functions to USFMPlugin.tsx ([cbbd815](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cbbd815ca14ec79eba8902c917e5f1900ef08926))
* **1.2:** register cursor correction listener in USFMPlugin.tsx useEffect ([5f881a1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5f881a1a1e88835bf972519052f24635d7324c01))
* **1.3:** make cursor correction tests pass ([41d841d](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/41d841d6c3c2ef25353280a5ca53d8035d9075f9))
* **2.1:** create test helper functions for editor testing ([7477084](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7477084b8aad6100db3e96f612cb842c8aeb9a3f))
* **2.2:** write failing unit tests for cursor correction ([7b982d7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7b982d7eeb45aba1ac957d8f547fd36bbfb0c3b5))
* **4.4:** Create ProjectIndexer service in app domain ([4a23432](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4a23432d4c960f11201ad898cceb5a9e7291cfeb))
* add auth session provider foundation ([a2d5921](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a2d5921f137d2e052260f31ad2b8f08439fb14d6))
* add cloud account import controls ([047e038](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/047e03822a4e0aef93c6e1be1e582d591e063fb9))
* add cloud project import source ([ae1ccbb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/ae1ccbbfca10f205f5f33ef69b1a679a6ea1dd29))
* add cloud status and sync controls ([b3593e8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b3593e821ca094a24074e9d3d244d7baa399be99))
* add local save and publish coordination ([540e3bc](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/540e3bce3fa86ae00fb5a8333d618d152d049637))
* add remote compare source workflow ([821cfa9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/821cfa91e24ea8abd1b0b845ea298149b5ff5786))
* add remote inspection and publish plumbing ([479873f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/479873fdab485722195d0857e45434dbe79080a4))
* add remote replay plumbing ([6aee327](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6aee327652615d0c9e1993dc03a6d64124d0959f))
* add remote repo linking and clone flows ([0e4d0cd](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/0e4d0cd5acbdebe45934f6ab80d3c2bf8bf0b92d))
* add remote state foundations ([e63805b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e63805b9faadfaaff3e38947f9a38af1938e22b2))
* **core:** adopt typed library items and packed TN imports ([cd129d9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cd129d94b95eaf190a15bece777893f9010b86ee))
* **editor:** add flat token adapter for paragraph-tree structure ([5c394ff](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c394fff0987def9fc81e0bf0c44fa13b735229c))
* **editor:** build paragraph containers on parse ([59408dc](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/59408dc2373cfc67ee42173faf25cb431199903b))
* **editor:** explicit tree&lt;-&gt;flat transforms for mode switching ([f26068f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f26068fddc2a1a00f9c11cdbf4fdbb39044e7600))
* **editor:** handle backslash at start of verse to insert text node before marker ([a6db134](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a6db1345bb3dc68f0c1ae7779d9948008a207989))
* **editor:** implement Regular-mode paragraph insertion split-and-move (Task 7) ([6f80ede](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6f80edea2238becf56d61505042c08f7bd6209b9))
* **editor:** migrate prettify/search/matchFormatting to adapter (Task 11) ([041776f](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/041776fbbc14e1fe7aacfa2517fea3a902911a45))
* **editor:** redirect Enter at start of verse to insert newline before marker ([c2fbfb3](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c2fbfb399e03279403e86de837d3955e44c10da2))
* **editor:** Regular-mode structural enforcement for paragraph containers ([6bafba9](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6bafba9af6fb35b97b0ef1837d524ef68480f1f0))
* **editor:** remove inPara writes in Regular mode (Task 12) ([e423977](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e42397799d6dc6e506ffadfd7d330d82ae7774b8))
* **editor:** rename USFMElementNode to USFMParagraphNode ([b95e7f1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b95e7f16a17a8ec448fa7d0b7cee3f9a12ee0bbd))
* **editor:** simplify context menu modes to match settings presets ([a99ea8a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/a99ea8a50e312d70d064c000063e08d9bf65487b))
* **editor:** simplify verse/chapter insertion to rely on structural integrity loop ([d9b19f7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/d9b19f71862cf7db8cc1c697d5ad66c138cd6a66))
* **editor:** stabilize runtime, fix USFM mode, finish Task 10 ([4d8b35a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4d8b35aa497d39f41716030240881b3dc0f44cd6))
* **editor:** update paragraphingUtils to use flat token adapter (Task 9) ([be80f6a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/be80f6afdc4493088dfa73caca21b451cd4b8c21))
* **editor:** use flat token adapter in serializeToUsfmString ([cef5e64](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cef5e6448d7dd0a1be1f6ac79e05e0a944364e16))
* extract DOM logic to useSearchHighlighter hook ([9481424](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/94814249d868f54ab038d69bb4f6abc4615130a8))
* extract search utilities to pure module ([fdd8dda](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/fdd8dda2b15c7604ab0204ece5a6196299ce5992)), closes [#2](https://github.com/WycliffeAssociates/scripture-editor-proto/issues/2)
* hydrate remote status on project open ([028d4a5](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/028d4a52a826ee2b69ac68814e1c0e70378aa62a))
* implement paragraphing mode mobile support and progress indicator ([82cd5ae](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/82cd5ae8ee8ef78939d5df8a12134abe77adeb4c))
* implement USFM prettify feature with book and project scopes ([7ab8742](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7ab874215d47812589c0f8cc36091c60bd4b16aa))
* **release:** channel-aware workflow + Cloudflare workers + R2 mirror ([7c508e3](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7c508e3f037f8e8fb8bb44bd2ce2e117b6b56d25))
* sanitize portable cloud project artifacts ([b44edde](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b44edde3f8f15e91cd7626e9ed8142281b4523be))
* **search:** auto-rerun on undo/redo + programmatic working-files commits ([8133681](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8133681976d8e3217b453c4a917ade3355fda73c))
* **ui:** style poetry by paragraph containers ([564c014](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/564c01463ab9d11c818cb0c029f9dc397ec91c3d))
* **updater:** Tauri auto-updater with banner, settings panel, and manual switch ([48f18b8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/48f18b82ce8acd45c88387c5e59ab9ff20561527))
* use linked session for save commit authorship ([330403a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/330403a7f0431afe480580e59aeb67868e8cf941))
* working-files store refactor + CI/CD release pipeline + Tauri auto-updater ([7bf47bb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/7bf47bb0a1ad97956fa797d56c33bf68caa415e5))


### Bug Fixes

* **deps:** bump usfm-onion-web to v0.0.4 to keep WASM init in prod builds ([8f25a6c](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8f25a6cfad5f210e2a3c8a3d238a3ca7880cf283))
* **editor:** ensure verse and chapter numbers are always mutable ([1fcecca](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/1fceccab872ed17921eec2e7ca4a738419be3280))
* **editor:** improve orphaned numberRange cleanup and text conversion ([c347f05](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c347f05c9cbdf996615f28c1223fb2c0002caeb1))
* **editor:** restore editor focus after Action Palette closes ([f2280c1](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f2280c1704c5e8f25295438e84d1feb83830d0e8))
* **editor:** unify copy logic with cut to respect selection boundaries ([44a703a](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/44a703a337071d40393343deeadcc10069bef7e7))
* lint filter "all" re-expands when new codes/books arrive ([62ea993](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/62ea993d179e908279c844f5aa6871bbeecfc981))
* **lint:** re-calculate SIDs during existing token lint passes and fix SID bug ([40b4cd8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/40b4cd8605035a929a4c8cdbce8265c18dc73751))
* **prettify:** improve large project prettify notification and refactor hooks ([74bae1b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/74bae1ba26824273413c8ca19a2958acf97d9a3d))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([e33eeb2](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/e33eeb2d4caf84bcfe1ffdb0287d681d76ae5936))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([cb4164b](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/cb4164bffcc99c075fa49f6c7b2e4b8a18997a72))
* **prettify:** resolve stale closure bug in diff tracking and add batch updates ([4c24a87](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/4c24a877c350f3d7e2231ba0058aa18e802cd987))
* refine prettify logic for poetry, chapters, and duplicates ([dc87a13](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/dc87a13ec31eaf440125501e0467db73178c4009))
* **regression:** fix unit tests for usfm-as-tree refactor ([61dc312](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/61dc31206a1187f8aa43fd54d0c761e3b4151b24))
* **release:** bump root wrangler to 4.94.0 to resolve CF API entitlements error ([f5dcd94](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f5dcd945c3016f79e0de1e47115ab8c95cc791b6))
* **release:** deploy-web actually deploys the updater worker now ([c16141c](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c16141cc359e32771bd0b48116ce08bd963b140d))
* **release:** nightly app_version order swap so MSI bundler accepts it ([091ca55](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/091ca5562635e66a9f45eb3a8baa234231b28788))
* **release:** nightly app_version uses a single numeric identifier for MSI ([b194cce](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b194cceef4a9c537af3ac322aec1bb93d03cca74))
* **release:** point updater worker at the real GH repo ([f283242](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/f283242bb3395c41e53514b0a1895dc42cc75151))
* **updater:** worker target aliases, CORS, inline check status, popup containment ([05182c4](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/05182c4cc7ecb367c048caf3b79bb828365a242a))
* wrap ProjectView in ParagraphingProvider and add plugins to MainEditor ([9325821](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/9325821e4f0f948d0be249a43125adfd5d5e611a))


### Performance

* structural-sharing draft in undo/redo instead of full structuredClone ([8e894f8](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/8e894f859b53aedd95521ae3ec39a3044901021a))
* structural-sharing draftWithChapters for all working-files mutations ([c9c76a5](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c9c76a52c28eb3f459c4e1542c50e91f809eef55))


### Refactors

* **editor:** create hooks directory (ticket 5.1) ([c07e2eb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/c07e2eba79ec6addf32f2fe6603a488f723d6e80))
* **editor:** extract useEditorInput hook (ticket 5.4) ([5c33700](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c33700e7c53bee3d47431fc02387857f55259d2))
* **editor:** extract useEditorLinter hook (ticket 5.2) ([b36dc49](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/b36dc49effdb89aa1d955d3aec2eb4db4489557e))
* **editor:** extract useEditorStructure hook (ticket 5.3) ([43a1ff7](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/43a1ff7593b84e5c39b339df2482b45823c86cde))
* Split USFMPlugin utilities to separate files for Fast Refresh compliance ([467fb15](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/467fb15e692254e9b39eda4139b579efe94c1004))
* **test:** pull integration coverage to the working-files store seam ([5c3dadb](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/5c3dadbc8fdc5b780f1ffc45f4956a1245b9b798))


### Documentation

* **release:** release pipeline + updater topology spec ([6cdf6c6](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/6cdf6c6ed235d372c54438c5c365c3a9b27660c1))
* **specs:** reflect store-seam architecture and search-rerun policy ([5867737](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/586773770af6aa4f8324fa6733eb77f9b3fab866))
* state architecture + editor data flow specs for the working-files refactor ([241b504](https://github.com/WycliffeAssociates/scripture-editor-proto/commit/241b5047405c6fb4aa2584f2a08c18d638b83053))
