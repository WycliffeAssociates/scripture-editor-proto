
├── scripts
│   ├── [x] checkArchitecture.mjs
│   └── [x] syncVersions.js
├── src
│   ├── app
│   │   ├── data
│   │   │   ├── [x] constants.ts
│   │   │   ├── [x] editor.ts
│   │   │   └── [x] settings.ts
│   │   ├── db
│   │   │   └── __mocks__
│   │   ├── domain
│   │   │   ├── api
│   │   │   │   ├── [x] import.ts
│   │   │   │   ├── [x] projectToParsed.tsx
│   │   │   │   └── [x] scriptureProjectToParsedFiles.ts
│   │   │   ├── editor
│   │   │   │   ├── actions
│   │   │   │   │   ├── [x] markerActions.ts
│   │   │   │   │   ├── [x] modeActions.ts
│   │   │   │   │   ├── [x] navigationActions.tsx
│   │   │   │   │   ├── [x] prettifyActions.ts
│   │   │   │   │   ├── [x] registry.ts
│   │   │   │   │   ├── [x] searchActions.ts
│   │   │   │   │   ├── [x] themeActions.ts
│   │   │   │   │   └── [x] types.ts
│   │   │   │   ├── hooks
│   │   │   │   │   ├── [x] useEditorContext.ts
│   │   │   │   │   ├── [x] useEditorInput.ts
│   │   │   │   │   ├── [x] useEditorLintTooltip.ts
│   │   │   │   │   ├── [x] useEditorLinter.ts
│   │   │   │   │   ├── [x] useEditorStructure.ts
│   │   │   │   │   └── [x] useEditorView.ts
│   │   │   │   ├── listeners
│   │   │   │   │   ├── [x] editorQualityOfLife.ts
│   │   │   │   │   ├── [x] lintChecks.ts
│   │   │   │   │   ├── [x] maintainDocumentStructure.ts
│   │   │   │   │   ├── [x] maintainMetadata.ts
│   │   │   │   │   ├── [x] manageUsfmMarkers.ts
│   │   │   │   │   ├── [x] syncReferencePaneSid.ts
│   │   │   │   │   └── [x] useLineBreaksNotParas.ts
│   │   │   │   ├── nodes
│   │   │   │   │   ├── [x] USFMNestedEditorNode.tsx
│   │   │   │   │   ├── [x] USFMParagraphNode.ts
│   │   │   │   │   └── [x] USFMTextNode.ts
│   │   │   │   ├── plugins
│   │   │   │   │   ├── ContextMenu
│   │   │   │   │   │   ├── [x] ActionPalette.css.ts
│   │   │   │   │   │   ├── [x] ActionPalette.tsx
│   │   │   │   │   │   └── [x] selectionHighlight.ts
│   │   │   │   │   ├── [x] ContextMenuPlugin.tsx
│   │   │   │   │   ├── [x] CustomHistoryPlugin.tsx
│   │   │   │   │   ├── [x] LintTooltipPlugin.tsx
│   │   │   │   │   ├── [x] SearchReplaceSuggestPlugin.tsx
│   │   │   │   │   ├── [x] StructuralEmptyMarkerChipsPlugin.tsx
│   │   │   │   │   ├── [x] USFMPlugin.tsx
│   │   │   │   │   ├── [x] UsfmPeekOverlayPlugin.tsx
│   │   │   │   │   ├── [x] UsfmStylesPlugin.tsx
│   │   │   │   │   └── [x] VerseMarkerSuggestPlugin.tsx
│   │   │   │   ├── serialization
│   │   │   │   │   ├── [x] flatTokensByChapter.ts
│   │   │   │   │   └── [x] fromSerializedToLexical.ts
│   │   │   │   ├── services
│   │   │   │   │   └── [x] rebuildParsedFileFromUsfm.ts
│   │   │   │   ├── [x] states.ts
│   │   │   │   └── utils
│   │   │   │       ├── [x] debugLexicalSnapshot.ts
│   │   │   │       ├── [x] expandSelectionToIncludeVerseMarker.ts
│   │   │   │       ├── [x] insertMarkerOperations.ts
│   │   │   │       ├── [x] insertParagraphMarkerAtCursor.ts
│   │   │   │       ├── [x] lexicalHydrationToken.ts
│   │   │   │       ├── [x] materializeFlatTokensFromSerialized.ts
│   │   │   │       ├── [x] modeTransforms.ts
│   │   │   │       ├── [x] nodePositionUtils.ts
│   │   │   │       ├── [x] resolveTextInsertionAnchor.ts
│   │   │   │       ├── [x] serializedTraversal.ts
│   │   │   │       ├── [x] usfmPaste.ts
│   │   │   │       ├── [x] usfmTokenStreamSerializedAdapter.ts
│   │   │   │       ├── [x] verseMarkerHeuristics.ts
│   │   │   │       └── [x] verseNumberHeuristics.ts
│   │   │   ├── git
│   │   │   ├── history
│   │   │   │   ├── [x] HistoryManager.ts
│   │   │   │   ├── [x] canonicalChapterState.ts
│   │   │   │   └── [x] historyUndoRedoNotifications.ts
│   │   │   ├── project
│   │   │   │   ├── compare
│   │   │   │   │   ├── [x] compareService.ts
│   │   │   │   │   ├── [x] compareSourceLoader.ts
│   │   │   │   │   └── [x] types.ts
│   │   │   │   ├── [x] diffTypes.ts
│   │   │   │   ├── [x] saveAndRevertService.ts
│   │   │   │   ├── [x] versionNavigationService.ts
│   │   │   │   ├── [x] versionSnapshotAdapter.ts
│   │   │   │   └── [x] workingFileMutations.ts
│   │   │   ├── reference
│   │   │   ├── search
│   │   │   │   ├── [x] SearchProjectionService.ts
│   │   │   │   ├── [x] SearchService.ts
│   │   │   │   └── [x] search.utils.ts
│   │   │   └── settings
│   │   │       └── [x] settings.ts
│   │   ├── [x] entrypoint.tsx
│   │   ├── generated
│   │   │   └── [x] routeTree.gen.ts
│   │   ├── library
│   │   │   ├── [x] DefaultLibraryService.ts
│   │   │   └── [x] LibraryService.ts
│   │   ├── persistence
│   │   │   ├── [x] DefaultProjectsService.ts
│   │   │   └── [x] DexieProjectIndex.ts
│   │   ├── reference
│   │   │   ├── [x] translationNotes.ts
│   │   │   ├── [x] translationNotesRemoteSync.ts
│   │   │   └── [deleted] useReferenceItem.ts
│   │   ├── routes
│   │   │   ├── [x] $project.tsx
│   │   │   ├── [x] __root.tsx
│   │   │   ├── [x] create.tsx
│   │   │   ├── [x] createRouteHelpers.ts
│   │   │   ├── [x] index.tsx
│   │   │   ├── [x] playground.lazy.tsx
│   │   │   ├── [x] playground.tsx
│   │   │   └── [x] scaffold.tsx
│   │   ├── scripture
│   │   │   ├── [x] ScriptureWorkspaceState.ts
│   │   │   └── [x] openEditableScripture.ts
│   │   ├── services
│   │   └── ui
│   │       ├── components
│   │       │   ├── blocks
│   │       │   │   ├── [x] AppDrawer.tsx
│   │       │   │   ├── DiffModal
│   │       │   │   │   ├── [x] DiffModal.tsx
│   │       │   │   │   ├── [x] DiffModalChapterView.tsx
│   │       │   │   │   ├── [x] DiffModalListView.tsx
│   │       │   │   │   ├── [x] DiffViewerModal.tsx
│   │       │   │   │   ├── [x] chapterDiffViewModel.ts
│   │       │   │   │   ├── [x] chapterOptions.ts
│   │       │   │   │   ├── [x] diffDisplayUtils.ts
│   │       │   │   │   └── [x] rowUsfmOverrides.ts
│   │       │   │   ├── [x] Editor.tsx
│   │       │   │   ├── [x] LintPopover.tsx
│   │       │   │   ├── [x] MatchFormattingSuggestionsPanel.tsx
│   │       │   │   ├── [x] NestedEditor.tsx
│   │       │   │   ├── [x] ProjectCreator.tsx
│   │       │   │   ├── [x] ProjectRow.tsx
│   │       │   │   ├── ProjectSettings
│   │       │   │   │   ├── [x] EditorModeToggle.tsx
│   │       │   │   │   ├── [x] FontSizeControl.tsx
│   │       │   │   │   ├── Settings.module.css
│   │       │   │   │   ├── [x] Settings.tsx
│   │       │   │   │   └── [x] ZoomControl.tsx
│   │       │   │   ├── [x] ReferenceEditor.tsx
│   │       │   │   ├── [x] ReferencePicker.tsx
│   │       │   │   ├── [x] Search.tsx
│   │       │   │   ├── [x] SearchTrigger.tsx
│   │       │   │   └── [x] Toolbar.tsx
│   │       │   ├── import
│   │       │   │   └── [x] LanguageApiImporter.tsx
│   │       │   ├── primitives
│   │       │   │   ├── [x] ActionIcon.tsx
│   │       │   │   ├── [x] HistoryButton.tsx
│   │       │   │   ├── [x] Notifications.tsx
│   │       │   │   └── ProjectList
│   │       │   │       ├── [x] ProjectList.module.css.ts
│   │       │   │       └── [x] ProjectList.tsx
│   │       │   └── views
│   │       │       └── [x] ProjectView.tsx
│   │       ├── contexts
│   │       │   ├── [x] MediaQuery.tsx
│   │       │   └── [x] WorkspaceContext.tsx
│   │       ├── data
│   │       │   └── [x] formatMatching.ts
│   │       ├── effects
│   │       │   └── usfmDynamicStyles
│   │       │       └── [x] calcStyles.ts
│   │       ├── hooks
│   │       │   ├── [x] diffCalculationRunner.ts
│   │       │   ├── [x] lintState.ts
│   │       │   ├── [x] linting.ts
│   │       │   ├── save
│   │       │   │   ├── [x] shared.ts
│   │       │   │   ├── [x] useDiffModalState.ts
│   │       │   │   ├── [x] useExternalCompare.ts
│   │       │   │   ├── [x] useSaveAndRevert.ts
│   │       │   │   └── [x] useVersionHistory.ts
│   │       │   ├── search
│   │       │   │   ├── [x] searchTypes.ts
│   │       │   │   ├── [x] useSearchExecution.ts
│   │       │   │   ├── [x] useSearchNavigation.ts
│   │       │   │   └── [x] useSearchReplace.ts
│   │       │   ├── [x] useActions.tsx
│   │       │   ├── [x] useCustomHistory.ts
│   │       │   ├── [x] useDynamicStyles.tsx
│   │       │   ├── [x] useEditorState.tsx
│   │       │   ├── [x] useFormatMatching.tsx
│   │       │   ├── [x] useLint.tsx
│   │       │   ├── [x] useLintFixing.tsx
│   │       │   ├── [x] useModeSwitching.tsx
│   │       │   ├── [x] useNavigation.tsx
│   │       │   ├── [x] usePrettifyOperations.tsx
│   │       │   ├── [x] useReferenceItem.tsx
│   │       │   ├── [x] useSave.tsx
│   │       │   ├── [x] useSearch.tsx
│   │       │   ├── [x] useSearchHighlighter.ts
│   │       │   ├── [x] useWorkspaceContext.tsx
│   │       │   ├── [x] useWorkspaceState.tsx
│   │       │   └── utils
│   │       │       ├── [x] domUtils.ts
│   │       │       └── [x] editorUtils.ts
│   │       ├── i18n
│   │       │   ├── [x] detectLocale.ts
│   │       │   ├── [x] i18nEntry.tsx
│   │       │   ├── [x] loadLocale.tsx
│   │       │   ├── locales
│   │       │   │   ├── en
│   │       │   │   │   ├── [x] messages.po
│   │       │   │   │   └── [x] messages.ts
│   │       │   │   └── es
│   │       │   │       ├── [x] messages.po
│   │       │   │       └── [x] messages.ts
│   │       │   └── [x] usfmOnionLocalization.ts
│   ├── core
│   │   ├── data
│   │   │   ├── bible
│   │   │   │   └── [x] bible.ts
│   │   │   └── utils
│   │   │       └── [x] generic.ts
│   │   ├── domain
│   │   │   ├── md5
│   │   │   │   ├── [x] IMd5Service.ts
│   │   │   │   └── [x] webMd5.ts
│   │   │   ├── project
│   │   │   │   ├── [deleted] IProjectLoader.ts
│   │   │   │   ├── [deleted] ProjectLoader.ts
│   │   │   │   ├── [x] ResourceContainerProjectLoader.ts
│   │   │   │   ├── [x] ScriptureBurritoProjectLoader.ts
│   │   │   │   ├── [deleted] baseResourceLoading.ts
│   │   │   │   ├── [x] bookMapping.ts
│   │   │   │   ├── import
│   │   │   │   │   ├── [x] Importer.ts
│   │   │   │   │   ├── [x] LanguageApiImporter.ts
│   │   │   │   │   ├── [x] ProjectDirectoryImporter.ts
│   │   │   │   │   ├── [x] ProjectFileImporter.ts
│   │   │   │   │   ├── [x] ProjectImporter.ts
│   │   │   │   │   ├── [x] WacsRepoImporter.ts
│   │   │   │   │   ├── [x] ZipImportPipeline.ts
│   │   │   │   │   └── [x] browserImportPipeline.ts
│   │   │   │   ├── [x] project.ts
│   │   │   │   ├── [deleted] promoteBaseResourceToProject.ts
│   │   │   │   ├── resourceContainer
│   │   │   │   │   └── [x] resourceContainer.ts
│   │   │   │   ├── [x] scriptureBurritoHelpers.ts
│   │   │   │   ├── [x] referenceItemLoading.ts
│   │   │   │   └── [x] scriptureBurritoSchemas.ts
│   │   │   ├── search
│   │   │   │   ├── [x] replaceEngine.ts
│   │   │   │   ├── [x] searchEngine.ts
│   │   │   │   └── [x] types.ts
│   │   │   └── usfm
│   │   │       ├── [x] IUsfmOnionService.ts
│   │   │       ├── [x] lex.ts
│   │   │       ├── [x] matchFormattingByVerseAnchors.ts
│   │   │       ├── [x] onionMarkers.ts
│   │   │       ├── [x] parseUtils.ts
│   │   │       ├── prettify
│   │   │       │   ├── [x] prettifyMarkers.ts
│   │   │       │   └── [x] prettifyTokenStream.ts
│   │   │       ├── [x] tokenEnvelope.ts
│   │   │       ├── [x] usfmOnionAdapters.ts
│   │   │       ├── [x] usfmOnionDiffMap.ts
│   │   │       └── [x] usfmOnionTypes.ts
│   │   ├── io
│   │   ├── library
│   │   │   ├── [x] ImportService.ts
│   │   │   ├── [x] LibraryItem.ts
│   │   │   ├── [x] LibraryItemCapabilities.ts
│   │   │   ├── [x] LibraryItemType.ts
│   │   │   ├── [x] ProjectIndex.ts
│   │   │   ├── [x] LoadedReferenceItem.ts
│   │   │   ├── [x] ReferenceDocuments.ts
│   │   │   ├── [x] ReferenceItemSupport.ts
│   │   │   ├── items
│   │   │   │   ├── [x] TranslationNotesItem.ts
│   │   │   │   └── [x] UsfmScriptureItem.ts
│   │   │   └── stores
│   │   │       └── [x] PackedTranslationNotesRepository.ts
│   │   ├── loading
│   │   │   ├── [x] IItemLoader.ts
│   │   │   ├── [x] ItemLoader.ts
│   │   │   ├── builders
│   │   │   │   ├── [x] buildTranslationNotesItem.ts
│   │   │   │   └── [x] buildUsfmScriptureItem.ts
│   │   │   └── container
│   │   │       ├── [x] loadResourceContainer.ts
│   │   │       └── [x] loadScriptureBurrito.ts
│   │   └── persistence
│   │       ├── [deleted] BaseResource.ts
│   │       ├── [deleted] BaseResourceCapabilities.ts
│   │       ├── [x] FileSystem.ts
│   │       ├── [x] GitProvider.ts
│   │       ├── [x] IOpener.ts
│   │       ├── [deleted] LoadedBaseResource.ts
│   │       ├── [x] ScriptureWorkspace.ts
│   │       ├── [x] WorkspaceService.ts
│   │       ├── [x] StorageRoots.ts
│   │       ├── [x] ensureProjectGitReady.ts
│   │       ├── [x] gitConstants.ts
│   │       ├── [x] gitVersionUtils.ts
│   │       ├── [x] pathUtils.ts
│   │       └── repositories
│   ├── [x] routeTree.gen.ts
│   ├── tauri
│   │   ├── adapters
│   │   │   └── git
│   │   │       └── [x] TauriGitProvider.ts
│   │   ├── domain
│   │   │   ├── md5
│   │   │   │   └── [x] TauriMd5Service.ts
│   │   │   ├── settings
│   │   │   │   └── [x] settings.ts
│   │   │   └── usfm
│   │   │       └── [x] TauriUsfmOnionService.ts
│   │   ├── io
│   │   │   ├── [x] PathUtils.ts
│   │   │   └── [x] TauriWritableFileStreamWriter.ts
│   │   ├── [x] main.tsx
│   │   ├── persistence
│   │   │   ├── [x] TauriFileSystem.ts
│   │   │   ├── [x] TauriImportService.ts
│   │   │   ├── [x] TauriOpener.ts
│   │   │   └── [x] TauriStorageRoots.ts
│   └── web
│       ├── adapters
│       │   └── git
│       │       ├── [x] OpfsGitFs.ts
│       │       └── [x] WebGitProvider.ts
│       ├── domain
│       │   ├── [x] settings.ts
│       │   └── usfm
│       │       └── [x] WebUsfmOnionService.ts
│       ├── io
│       │   └── write
│       │       └── [x] WebFileWriteBackend.ts
│       ├── [x] main.tsx
│       └── persistence
│           ├── [x] OpfsFileSystem.ts
│           ├── [x] OpfsStorageRoots.ts
│           ├── [x] WebImportService.ts
│           ├── [x] WebOpener.ts
│           └── [x] storageNamespace.ts
