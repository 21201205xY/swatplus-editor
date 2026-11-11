<script setup lang="ts">
	import { reactive, computed, onMounted, onUnmounted, watch } from 'vue';
	import moment from 'moment';
	import 'moment/dist/locale/zh-cn';
	import { useRoute } from 'vue-router';
	import { useI18n } from 'vue-i18n';
	import { useTheme, useDisplay } from 'vuetify';
	import { useHelpers } from '@/helpers';
	import SwatPlusToolboxButton from '../components/SwatPlusToolboxButton.vue';
	import SwatPlusIahrisButton from '../components/SwatPlusIahrisButton.vue';
	import { ProjectSettings } from '@/typings';

	// This page formats its dates per locale; keep other pages' existing default.
	moment.locale('en');
	const route = useRoute();
	const { t, locale } = useI18n({ useScope: 'global' });
	const theme = useTheme();
	const { mobile } = useDisplay();
	const { api, constants, errors, formatters, currentProject, runProcess, utilities, appUpdate } = useHelpers();
	
	let page:any = reactive({
		error: null,
		loading: false,
		colorTheme: 'light',
		secondaryNav: !mobile.value,
		open: {
			loading: false,
			error: null,
			show: false,
			projectDb: null
		},
		edit: {
			saving: false,
			error: null,
			show: false,
			name: null,
			description: null
		},
		create: {
			loading: false,
			error: null,
			show: false,
			name: null,
			description: null,
			projectFolder: null,
			datasetsDb: utilities.getDatabaseInstallPath(),
			isLte: false
		},
		close: {
			show: false,
			removeFromRecent: false
		},
		import: {
			show: false,
			error: null,
			project: {
				projectDb: null,
				datasetsDb: null,
				name: null,
				description: null,
				version: null,
				isLte: false
			}
		},
		openConfirm: {
			show: false,
			error: null,
			project: {},
			reimportMessage: false
		},
		loadScenario: {
			show: false,
			error: null,
			running: false,
			scenario: {}
		},
		noProject: {
			show: false
		},
		update: {
			show: false,
			error: null,
			running: false
		},
		existingIsLte: false
	})

	let recentProjects:any[] = reactive([])
	let versionSupport:any = reactive({})
	let loadTries = 0;

	let info:any = reactive({
		name: '',
		description: '',
		file_path: '',
		swat_exe_filename: '',
		last_modified: Date.now(),
		is_lte: false,
		status: {
			imported_weather: false,
			wrote_inputs: false,
			ran_swat: false,
			imported_output: false,
			using_gis: false
		},
		simulation: {},
		total_area: 0,
		totals: {},
		editor_version: '',
		gis_version: '',
		charts: {
			landuse: []
		},
		scenarios: []
	})

	const charts = computed(() => ({
		landuse: getPieChart(t('setup.chart.title'), info.charts.landuse, t('setup.chart.area'))
	}));
	const lastSaved = computed(() => moment(String(info.last_modified)).locale(locale.value === 'zh-CN' ? 'zh-cn' : 'en').format('llll'));
	const formRules = {
		required: (value:string) => !formatters.isNullOrEmpty(value) || t('common.required'),
		max: (numChars:number, value:string) => (value || '').length <= numChars || t('common.maximumCharacters', { count: numChars })
	};
	const versionMessage = computed(() => {
		if (constants.appSettings.version === null) return t('setup.version.unset');
		if (versionSupport.updatable) return t('setup.version.earlier', { projectVersion: currentProject.version, editorVersion: constants.appSettings.version });
		if (versionSupport.error) return t('setup.version.newer', { projectVersion: currentProject.version, editorVersion: constants.appSettings.version });
		return '';
	});

	async function init() {
		getColorTheme();
		if (route.path === '/') {
			recentProjects = utilities.getRecentProjects();

			let commandLineDb = currentProject.hasLoadedCommandLine ? '' : constants.globals.project_db;
			if (!formatters.isNullOrEmpty(commandLineDb)) {
				page.loading = true;
				page.open.projectDb = commandLineDb;
				await openProject();
				page.loading = false;
			} else {
				let hasProject = currentProject.hasCurrentProject && utilities.pathExists(currentProject.projectDb||'');
				if (!hasProject) {
					let project = utilities.getMostRecentProject();
					if (project !== undefined && utilities.pathExists(project.projectDb)) {
						currentProject.setCurrentProject(project);
						hasProject = true;
					}
				}

				utilities.setWindowTitle();

				if (hasProject) {
					await getInfo();
				}
			}
		}		
	}

	async function getSwatVersionTitle(config_swat_exe_filename:string|null) {
		let v = `rev. ${constants.appSettings.swatplus}`;
		if (!formatters.isNullOrEmpty(config_swat_exe_filename)) {
			try {
				let exeOptions = await runProcess.getSwatExeOptions();
				if (exeOptions !== null && exeOptions.length > 0) {
					let exeOption = exeOptions.find((x:any) => x.fileName === config_swat_exe_filename);
					if (exeOption) v = exeOption.description.split('(')[0].trim();
				}
			} catch (error) {
				errors.log(error);
			}
		}
		return v;
	}

	async function openProject() {
		page.open.loading = true;
		page.open.error = null;

		try {
			const response = await api.get(`setup/config`, currentProject.getTempApiHeader(page.open.projectDb));
			errors.log(response.data);

			let swatVersionTitle = await getSwatVersionTitle(response.data.swat_exe_filename);

			let project:ProjectSettings = {
				projectDb: page.open.projectDb,
				datasetsDb: response.data.reference_db,
				name: response.data.project_name,
				description: response.data.project_description,
				version: response.data.editor_version,
				isLte: response.data.is_lte,
				swatVersion: swatVersionTitle
			}

			if (formatters.isNullOrEmpty(response.data.gis_version)) {
				await loadProject(project);
			} else if (response.data.imported_gis) {
				page.openConfirm.project = project;
				page.openConfirm.show = true;
				page.existingIsLte = page.openConfirm.project.isLte;
			} else {
				project.version = constants.appSettings.version;
				page.import.project = project;
				page.import.show = true;
			}

			page.open.show = false;
			loadTries = 0;
		} catch (error) {
			if (loadTries < 10) {
				loadTries++;
				await sleep(2000);
				await openProject();
			} else {
				page.open.error = errors.logError(error, t('setup.errors.load'));
				loadTries = 0;
			}
		}

		page.open.loading = false;
	}

	async function confirmOpen() {
		page.openConfirm.show = false;
		await loadProject(page.openConfirm.project);
	}

	async function loadProject(project:ProjectSettings) {
		if (utilities.pathExists(project.projectDb||'')) {
			currentProject.setCurrentProject(project);
			utilities.pushRecentProject(project);
			recentProjects = utilities.getRecentProjects();
			utilities.setWindowTitle();
			versionSupport = utilities.getVersionSupport(project.version||'');
			await getInfo();
			currentProject.setHasLoadedCommandLine(true);
		} else {
			page.noProject.show = true;
		}
	}

	async function getInfo() {
		page.loading = true;
		page.error = null;

		try {
			const response = await api.get(`setup/info`, currentProject.getApiHeader());
			errors.log(response.data);
			Object.assign(info, response.data);
			versionSupport = utilities.getVersionSupport(currentProject.version||'');
		} catch (error) {
			errors.log(error);
		}
		
		page.loading = false;
	}

	function getPieChart(title:string, data:any, seriesLabel:string) {
		return {
			lang: {
				contextButtonTitle: t('setup.chart.lang.contextButtonTitle'),
				viewFullscreen: t('setup.chart.lang.viewFullscreen'),
				exitFullscreen: t('setup.chart.lang.exitFullscreen'),
				printChart: t('setup.chart.lang.printChart'),
				downloadPNG: t('setup.chart.lang.downloadPNG'),
				downloadJPEG: t('setup.chart.lang.downloadJPEG'),
				downloadPDF: t('setup.chart.lang.downloadPDF'),
				downloadSVG: t('setup.chart.lang.downloadSVG'),
				downloadCSV: t('setup.chart.lang.downloadCSV'),
				downloadXLS: t('setup.chart.lang.downloadXLS'),
				viewData: t('setup.chart.lang.viewData'),
				hideData: t('setup.chart.lang.hideData'),
				exportData: {
					categoryHeader: t('setup.chart.lang.exportData.categoryHeader'),
					categoryDatetimeHeader: t('setup.chart.lang.exportData.categoryDatetimeHeader')
				}
			},
			chart: { styledMode: true },
			plotOptions: { pie: { dataLabels: { enabled: false }, showInLegend: true } },
			title: { text: title },
			tooltip: { pointFormat: '{series.name}: <b>{point.percentage:,.1f}% ({point.y:,.1f} ha)</b>' },
			series: [{ data: data, name: seriesLabel, type: 'pie' }]
		};
	}

	function removeProject(project:ProjectSettings) {
		if (currentProject.projectDb === project.projectDb) {
			page.close.removeFromRecent = true;
			page.close.show = true;
		} else {
			utilities.deleteRecentProject(project);
			recentProjects = utilities.getRecentProjects();
		}
	}

	function closeCurrentProject() {
		if (page.close.removeFromRecent) {
			utilities.deleteRecentProject(currentProject.getObject());
			recentProjects = utilities.getRecentProjects();
		}

		currentProject.setCurrentProject({
			projectDb: null,
			datasetsDb: null,
			name: null,
			version: null,
			isLte: false
		});
		versionSupport = {};
		page.close.show = false;
	}

	function openEditProject() {
		page.edit.name = currentProject.name;
		page.edit.description = currentProject.description;
		page.edit.show = true;
	}

	async function editProject() {
		page.edit.saving = true;
		page.edit.error = null;

		if (formatters.isNullOrEmpty(page.edit.name)) {
			page.edit.error = t('setup.errors.name');
		} else {
			try {
				let data = {
					'name': formatters.toValidName(page.edit.name),
					'description': formatters.toValidName(page.edit.description)
				};

				const response = await api.put(`setup/config`, data, currentProject.getApiHeader());
				errors.log(response.data);
				currentProject.name = data.name;
				currentProject.description = data.description;
				page.edit.show = false;
				await loadProject(currentProject.getObject());
			} catch (error) {
				page.edit.error = errors.logError(error, t('setup.errors.save'));
			}
		}
		
		page.edit.saving = false;
	}

	//Calls to swatplus_api.py

	function createProject() {
		page.create.loading = true;
		page.create.error = null;

		if (formatters.isNullOrEmpty(page.create.name))
			page.create.error = t('setup.errors.name');
		else if (formatters.isNullOrEmpty(page.create.projectFolder))
			page.create.error = t('setup.errors.folder');
		else if (formatters.isNullOrEmpty(page.create.datasetsDb))
			page.create.error = t('setup.errors.datasets');
		else {
			let fileName = formatters.toValidFileName(page.create.name).toLowerCase();
			let project = {
				projectDb: utilities.joinPaths([page.create.projectFolder, fileName + '.sqlite']),
				datasetsDb: page.create.datasetsDb,
				name: formatters.toValidName(page.create.name),
				description: formatters.toValidName(page.create.description),
				version: constants.appSettings.version,
				isLte: page.create.isLte,
				swatVersion: `rev. ${constants.appSettings.swatplus}`
			};
			let lte = project.isLte ? 'y' : 'n';

			let args = [
				'setup_project', 
				'--project_db_file='+ project.projectDb,
				'--datasets_db_file='+ project.datasetsDb, 
				'--project_name='+ project.name,
				'--editor_version='+ constants.appSettings.version,
				'--is_lte=' + lte, 
				'--project_description='+ project.description,
				'--copy_datasets_db=y'
			];

			runTask(args, project);
		}

		page.create.loading = false;
	}

	function importProject() {
		page.import.error = null;

		if (formatters.isNullOrEmpty(page.import.project.name)) {
			page.import.error = t('setup.errors.importName');
		} else {
			let project = page.import.project;
			let lte = project.isLte ? 'y' : 'n';

			let args = [
				'setup_project', 
				'--project_db_file='+ project.projectDb, 
				'--project_name='+ formatters.toValidName(project.name),
				'--editor_version='+ constants.appSettings.version,
				'--is_lte=' + lte, 
				'--project_description='+ formatters.toValidName(project.description)
			];

			runTask(args, project);
		}
	}

	async function reimportGis() {
		page.open.projectDb = currentProject.projectDb;
		page.openConfirm.reimportMessage = true;
		await openProject();
	}

	function reImportProject() {
		let project = page.openConfirm.project;
		let lte = project.isLte ? 'y' : 'n';
		page.update.running = true;

		let args = [
			'reimport_gis', 
			'--project_db_file='+ project.projectDb, 
			'--project_name='+ project.name,
			'--editor_version='+ constants.appSettings.version,
			'--is_lte=' + lte
		];

		runTask(args, project);
	}

	function updateProject() {
		page.update.error = null;
		page.update.show = true;
		page.update.running = true;
		
		let args = [
			'update_project', 
			'--project_db_file='+ currentProject.projectDb, 
			'--editor_version='+ constants.appSettings.version,
			'--update_project_values=n',
			'--reimport_gis=n'
		];

		runTask(args, currentProject.getObject());
	}

	function askLoadScenario(scenario:any) {
		page.loadScenario.scenario = scenario;
		page.loadScenario.show = true;
	}

	function loadScenario() {
		page.loadScenario.error = null;
		page.loadScenario.running = true;
		
		let args = [
			'load_scenario', 
			'--project_db_file='+ currentProject.projectDb,
			'--project_name='+ page.loadScenario.scenario.name
		];

		runTask(args, currentProject.getObject());
	}

	//Task processing to handle calls and feedback from swatplus_api.py

	let task:any = reactive({
		progress: {
			percent: 0,
			message: null
		},
		process: null,
		error: null,
		running: false,
		currentPid: null,
		currentProject: null
	})

	function runTask(args:string[], project:ProjectSettings) {
		task.error = null;
		task.running = true;
		task.progress = {
			percent: 0,
			message: null
		};
		task.currentProject = project;

		task.currentPid = runProcess.runApiProc('setup', 'swatplus_api', args);
	}

	let listeners:any = {
		stdout: undefined,
		stderr: undefined,
		close: undefined,
		appUpdateStatus: undefined,
	}

	function initRunProcessHandlers() {
		errors.log('Adding run process handlers');
		listeners.stdout = runProcess.processStdout('setup', (data:any) => {
			task.progress = runProcess.getApiOutput(data);
		});
		
		listeners.stderr = runProcess.processStderr('setup', (data:any) => {
			console.log(`stderr: ${data}`);
			task.error = data;
			task.running = false;
		});
		
		listeners.close = runProcess.processClose('setup', async (code:any) => {
			let project = task.currentProject;
			if (formatters.isNullOrEmpty(task.error)) {
				if (page.loadScenario.running) {
					page.open.projectDb = project.projectDb;
					await openProject();
					task.running = false;
					closeTaskModals();
				} else {
					if (page.update.running) {
						project.version = constants.appSettings.version;
					}
					await loadProject(project);
					task.running = false;
					closeTaskModals();
				}
			}
		});

		listeners.appUpdateStatus = runProcess.appUpdateStatus((stdData:any) => {
			console.log(`Update status received: ${stdData}`);
			let status:any = runProcess.getApiOutput(stdData);
			appUpdate.setStatus(status.message, status.isAvailable);
		});
	}

	function removeRunProcessHandlers() {
		errors.log('Removing run process handlers');
		if (listeners.stdout) listeners.stdout();
		if (listeners.stderr) listeners.stderr();
		if (listeners.close) listeners.close();
		if (listeners.appUpdateStatus) listeners.appUpdateStatus();
	}

	function cancelTask() {
		task.error = null;
		runProcess.killProcess(task.currentPid);
		
		task.running = false;
		closeTaskModals();
	}

	function closeTaskModals() {
		page.import.show = false;
		page.loadScenario.show = false;
		page.loadScenario.running = false;
		page.create.show = false;
		page.openConfirm.show = false;
		page.update.show = false;
	}

	//Color theme

	function getColorTheme():void {
		let colorTheme = localStorage.getItem('colorTheme');
		if (colorTheme === null) colorTheme = utilities.getColorTheme();
		setColorTheme(colorTheme);
		//console.log(theme.current.value.colors)
	}

	function setColorTheme(colorTheme:string|null):void {
		if (colorTheme === null || colorTheme === 'system') colorTheme = 'light';
		page.colorTheme = colorTheme;
		theme.change(colorTheme);
		utilities.setColorTheme(colorTheme);
		localStorage.setItem('colorTheme', colorTheme);
	}

	function toggleColorTheme():void {
		if (page.colorTheme === 'light') setColorTheme('dark');
		else setColorTheme('light');
	}

	//Lifecycle hooks

	onMounted(async () => {
		initRunProcessHandlers();
		await init();
	});
	onUnmounted(() => removeRunProcessHandlers());

	watch(
		() => route.name,
		async () => await init()
	)

	async function sleep(ms:number|undefined) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
</script>

<template>
	<div>
		<v-navigation-drawer theme="dark" rail permanent>
			<div class="px-2">
				<v-tooltip location="end" :text="t('navigation.expandMenu')">
					<template v-slot:activator="{ props }">
						<v-app-bar-nav-icon v-bind="props" v-if="mobile && route.path === '/' && formatters.isNullOrEmpty(page.error) && currentProject.hasCurrentProject" 
							:aria-label="t('navigation.expandMenu')" rounded="0" variant="text" @click.stop="page.secondaryNav = !page.secondaryNav"></v-app-bar-nav-icon>
					</template>
				</v-tooltip>
			</div>
			<v-list density="compact" nav>
				<v-list-item prepend-icon="fas fa-folder-open" to="/" :active="route.path === '/'">
					<v-tooltip activator="parent" location="end">{{ t('navigation.project') }}</v-tooltip>
				</v-list-item>
				<v-list-item prepend-icon="fas fa-pencil-alt" to="/edit">
					<v-tooltip activator="parent" location="end">{{ t('navigation.edit') }}</v-tooltip>
				</v-list-item>
				<v-list-item prepend-icon="fas fa-play" to="/run">
					<v-tooltip activator="parent" location="end">{{ t('navigation.run') }}</v-tooltip>
				</v-list-item>
				<v-list-item prepend-icon="fas fa-check" to="/check">
					<v-tooltip activator="parent" location="end">{{ t('navigation.check') }}</v-tooltip>
				</v-list-item>
			</v-list>

			<template #append>
				<v-list density="compact" nav>
					<v-list-item prepend-icon="fas fa-language" aria-label="Language / 语言" class="pointer">
						<v-tooltip activator="parent" location="end">Language / 语言</v-tooltip>
						<v-menu activator="parent" location="end">
							<v-list density="compact">
								<v-list-item title="English" :active="locale === 'en'" @click="locale = 'en'"></v-list-item>
								<v-list-item title="简体中文" :active="locale === 'zh-CN'" @click="locale = 'zh-CN'"></v-list-item>
							</v-list>
						</v-menu>
					</v-list-item>
					<v-list-item prepend-icon="fas fa-circle-info" v-if="currentProject.hasCurrentProject" class="pointer">
						<v-menu activator="parent" location="end" open-on-hover>
							<v-list density="compact">
								<v-list-subheader>SWAT+ Editor {{ constants.appSettings.version }}</v-list-subheader>
								<v-list-item>{{currentProject.name}}</v-list-item>
								<v-list-item><open-file :file-path="info.file_path" class="text-primary text-decoration-none">{{ t('setup.openDirectory') }}</open-file></v-list-item>
							</v-list>
						</v-menu>
					</v-list-item>
					<v-list-item prepend-icon="fas fa-circle-question" to="/help">
						<v-tooltip activator="parent" location="end">{{ t('navigation.help') }}</v-tooltip>
					</v-list-item>
					<v-list-item v-if="appUpdate.isAvailable" to="/update">
						<template v-slot:prepend>
							<v-badge :content="1" color="error"><v-icon>fas fa-bell</v-icon></v-badge>
						</template>
						<v-tooltip activator="parent" location="end">{{ t('navigation.update') }}</v-tooltip>
					</v-list-item>
					<v-list-item :prepend-icon="page.colorTheme === 'light' ? 'fas fa-sun' : 'fas fa-moon'" @click="toggleColorTheme">
						<v-tooltip activator="parent" location="end">{{ t('navigation.theme') }}</v-tooltip>
					</v-list-item>
				</v-list>
			</template>
		</v-navigation-drawer>

		<div v-if="route.path === '/'">
			<v-main v-if="page.loading">
				<page-loading :loading="page.loading"></page-loading>
			</v-main>
			<v-main v-else-if="!formatters.isNullOrEmpty(page.error)">
				<div class="py-3 px-6">
					<h1>SWAT+ Editor {{ constants.appSettings.version }}</h1>
					<v-alert color="info" icon="$info">
						<template #text>
							<p>{{ t('setup.errors.encountered', { error: page.error }) }}</p>
							<p>
								{{ t('setup.errors.help') }}
							</p>
							<v-btn @click="getInfo" :loading="page.loading">{{ t('setup.reload') }}</v-btn>
						</template>
					</v-alert>
				</div>
			</v-main>
			<div v-else-if="!currentProject.hasCurrentProject">
				<v-main>
					<div class="py-3 px-6">
						<v-sheet elevation="2" max-width="800" rounded="lg" width="100%" class="my-4 pa-4 text-center mx-auto">
							<h2 class="text-h5 mb-6">{{ t('setup.welcome', { version: constants.appSettings.version }) }}</h2>

							<p class="mb-4 text-medium-emphasis">
								<i18n-t scope="global" keypath="setup.releaseIntroduction" tag="span">
									<template #link><open-in-browser url="https://github.com/swat-model/swatplus-editor/blob/main/changelog.md"  :text="t('setup.readReleaseNotes')" /></template>
								</i18n-t>
							</p>

							<div v-if="recentProjects.length > 0" class="my-5">
								<h2 class="text-h6 text-center">{{ t('setup.recentProjects') }}</h2>
								<ul class="plain-border">
									<li v-for="(project, i) in recentProjects" :key="i" class="d-flex">
										<a href="#" :title="project.projectDb" :class="project.projectDb === currentProject.projectDb ? 'font-italic text-primary' : 'text-primary'"
											@click.prevent="loadProject(project)">{{project.name}}</a>
										<a class="ml-auto text-medium icon" href="#"
											@click.prevent="removeProject(project)"
											:title="t('setup.removeRecent', { name: project.name })">
											<font-awesome-icon :icon="['fas', 'times']" /></a>
									</li>
								</ul>
							</div>

							<div>
								<v-btn class="text-none mr-2" color="primary" rounded variant="flat" @click="page.open.show = true">{{ t('setup.openProject') }}</v-btn>
								<v-btn class="text-none" color="secondary" rounded variant="tonal" @click="page.create.show = true">{{ t('setup.createProject') }}</v-btn>
							</div>
						</v-sheet>
					</div>
				</v-main>
			</div>
			<div v-else>
				<v-navigation-drawer v-model="page.secondaryNav" id="secondary-nav">
					<div class="pa-3">
						<h1 class="mb-2 text-h6">SWAT+ Editor {{ constants.appSettings.version }}</h1>
						<p class="mb-5">
							<i18n-t scope="global" keypath="setup.releaseIntroduction" tag="span">
								<template #link><open-in-browser class="text-primary" url="https://swatplus.gitbook.io/docs/release-notes" :text="t('setup.readReleaseNotes')" /></template>
							</i18n-t>
						</p>

						<div class="mb-7">
							<v-btn variant="flat" color="primary" block @click="page.open.show = true" class="mb-2">{{ t('setup.openAnotherProject') }}</v-btn>
							<v-btn variant="tonal" color="primary" block @click="page.create.show = true">{{ t('setup.createProject') }}</v-btn>
						</div>

						<div v-if="recentProjects.length > 0" class="mt-4">
							<h2 class="mb-2 text-h6">{{ t('setup.recentProjects') }}</h2>
							<ul class="plain-border text-body-2">
								<li v-for="(project, i) in recentProjects" :key="i" class="d-flex">
									<a href="#" :title="project.projectDb" :class="project.projectDb === currentProject.projectDb ? 'font-italic text-primary' : 'text-primary'"
										@click.prevent="loadProject(project)">{{project.name}}</a>
									<a class="ml-auto text-medium icon" href="#"
										@click.prevent="removeProject(project)"
										:title="t('setup.removeRecent', { name: project.name })">
										<font-awesome-icon :icon="['fas', 'times']" /></a>
								</li>
							</ul>
						</div>
					</div>
				</v-navigation-drawer>

				<v-main>
					<div class="py-3 px-6">
						<v-card class="mb-6">
							<v-card-title>{{currentProject.name}}</v-card-title>
							<v-card-subtitle v-if="!formatters.isNullOrEmpty(currentProject.description)">{{formatters.toReadable(currentProject.description||'')}}</v-card-subtitle>
							<v-card-actions>
								<open-file button :file-path="info.file_path" variant="text" size="small" icon="fas fa-folder-open"></open-file>
								<v-btn v-if="versionSupport.supported" @click="openEditProject" variant="text" size="small" icon="fas fa-pen-to-square" :title="t('setup.changeDescription')"></v-btn>
								<v-spacer></v-spacer>
								<open-file button :file-path="info.file_path" variant="text" size="small" color="surface-variant"><code style="text-transform: none !important;">{{info.file_path}}</code></open-file>
							</v-card-actions>
						</v-card>

						<v-alert type="error" v-if="!formatters.isNullOrEmpty(versionSupport.error)" class="mb-6">
							{{ versionMessage }}
						</v-alert>

						<div v-if="versionSupport.supported">
							<v-row v-if="info.status.imported_weather || info.status.wrote_inputs">
								<v-col :md="info.scenarios.length > 0 ? 6 : 12" cols="12">
									<v-card>
										<v-list density="compact">
											<v-list-subheader class="text-uppercase">{{ t('setup.status.title') }}</v-list-subheader>
											<v-list-item to="/edit/climate/stations">
												<template #prepend>
													<v-icon :color="info.status.imported_weather ? 'success' : 'plain'">{{ info.status.imported_weather ? 'fas fa-check' : 'fas fa-minus' }}</v-icon>
												</template>
												{{ t('setup.status.weather') }}
											</v-list-item>
											<v-list-item to="/run" value="inputs-run">
												<template #prepend>
													<v-icon :color="info.status.wrote_inputs ? 'success' : 'plain'">{{ info.status.wrote_inputs ? 'fas fa-check' : 'fas fa-minus' }}</v-icon>
												</template>
												{{ t('setup.status.inputs') }}
											</v-list-item>
											<v-list-item to="/run" value="model-run">
												<template #prepend>
													<v-icon :color="info.status.ran_swat ? 'success' : 'plain'">{{ info.status.ran_swat ? 'fas fa-check' : 'fas fa-minus' }}</v-icon>
												</template>
												{{ t('setup.status.run') }}
											</v-list-item>
											<v-list-item to="/run" value="output-run">
												<template #prepend>
													<v-icon :color="info.status.imported_output ? 'success' : 'plain'">{{ info.status.imported_output ? 'fas fa-check' : 'fas fa-minus' }}</v-icon>
												</template>
												{{ t('setup.status.output') }}
											</v-list-item>
										</v-list>
									</v-card>
								</v-col>
								<v-col v-if="info.scenarios.length > 0" md="6">
									<v-card>
										<v-list density="compact">
											<v-list-subheader class="text-uppercase">{{ t('setup.savedScenarios') }}</v-list-subheader>
											<v-list-item v-for="(s, i) in info.scenarios" :key="i" @click="askLoadScenario(s)">{{ s.name }}</v-list-item>
										</v-list>
									</v-card>
								</v-col>
							</v-row>

							<h2 class="mt-6 mb-4 dash-heading">{{ t('setup.information.title') }}</h2>

							<v-row>
								<v-col cols="12" md="6">
									<v-card>
										<v-table>
											<tbody>
												<tr>
													<th>{{ t('setup.information.totalArea') }}</th>
													<td>{{formatters.toNumberFormat(info.total_area, 2)}} ha</td>
												</tr>
												<tr>
													<th>{{ t('setup.information.simulationPeriod') }}</th>
													<td>
														{{info.simulation.yrc_start}}
														{{info.simulation.day_start > 0 ? t('setup.day', { day: info.simulation.day_start }) : ''}}
														- 
														{{info.simulation.yrc_end}}
														{{info.simulation.day_end > 0 ? t('setup.day', { day: info.simulation.day_end }) : ''}}
													</td>
												</tr>
											</tbody>
										</v-table>
									</v-card>
								</v-col>
								<v-col cols="12" md="6">
									<v-card>
										<v-table>
											<tbody>
												<tr>
													<th>{{ t('setup.information.createdWith') }}</th>
													<td>SWAT+ Editor {{info.editor_version}}<span v-if="info.status.using_gis">, {{info.gis_version}}</span></td>
												</tr>
												<tr>
													<th>{{ t('setup.information.lastSaved') }}</th>
													<td>{{lastSaved}}</td>
												</tr>
											</tbody>
										</v-table>
									</v-card>
								</v-col>
							</v-row>

							<v-row>
								<v-col cols="12" md="6">
									<v-card>
										<v-card-subtitle class="text-uppercase mt-3">{{ t('setup.objects.title') }}</v-card-subtitle>
										<v-table density="comfortable" class="mt-1 mb-11">
											<tbody>
												<tr v-if="info.status.using_gis">
													<td class="text-right min">{{info.totals.subs}}</td>
													<td>{{ t('setup.objects.subbasins') }}</td>
												</tr>
												<tr v-if="info.totals.lhru > 0">
													<td class="text-right min">{{info.totals.lhru}}</td>
													<td><router-link class="text-primary" to="/edit/cons/hrus-lte">{{ t('setup.objects.hrus') }}</router-link></td>
												</tr>
												<tr v-else>
													<td class="text-right min">{{info.totals.hru}}</td>
													<td><router-link class="text-primary" to="/edit/cons/hrus">{{ t('setup.objects.hrus') }}</router-link></td>
												</tr>
												<tr>
													<td class="text-right min">{{info.totals.cha > 0 ? info.totals.cha : info.totals.lcha}}</td>
													<td><router-link class="text-primary" to="/edit/cons/channels">{{ t('setup.objects.channels') }}</router-link></td>
												</tr>
												<tr v-if="!info.is_lte">
													<td class="text-right min">{{info.totals.aqu}}</td>
													<td><router-link class="text-primary" to="/edit/cons/aquifers">{{ t('setup.objects.aquifers') }}</router-link></td>
												</tr>
												<tr v-if="!info.is_lte">
													<td class="text-right min">{{info.totals.res}}</td>
													<td><router-link class="text-primary" to="/edit/cons/reservoirs">{{ t('setup.objects.reservoirs') }}</router-link></td>
												</tr>
												<tr v-if="!info.is_lte">
													<td class="text-right min">{{info.totals.rtu}}</td>
													<td><router-link class="text-primary" to="/edit/cons/routing-units">{{ t('setup.objects.routingUnits') }}</router-link></td>
												</tr>
												<tr>
													<td class="text-right min">{{info.totals.lsus}}</td>
													<td><router-link class="text-primary" to="/edit/regions/ls_units">{{ t('setup.objects.landscapeUnits') }}</router-link></td>
												</tr>
												<tr v-if="!info.is_lte">
													<td class="text-right min">{{info.totals.rec}}</td>
													<td><router-link class="text-primary" to="/edit/cons/recall">{{ t('setup.objects.pointSources') }}</router-link></td>
												</tr>
											</tbody>
										</v-table>
									</v-card>
								</v-col>
								<v-col cols="12" md="6">
									<v-card>
										<v-card-text class="py-4 highcharts-dashboards-dark"><highcharts :key="locale" :options="charts.landuse"></highcharts></v-card-text>
									</v-card>
								</v-col>
							</v-row>
						</div>
						<v-card v-else-if="versionSupport.updatable">
							<v-card-item>
								<p class="mt-3">
									<i18n-t scope="global" keypath="setup.update.required" tag="span">
										<template #installEarlier><open-in-browser url="https://swatplus.gitbook.io/docs/installation"  :text="t('setup.update.installEarlier')" class="text-primary" /></template>
									</i18n-t>
								</p>
								<p>
									<i18n-t scope="global" keypath="setup.update.backup" tag="span">
										<template #releaseNotes><open-in-browser url="https://swatplus.gitbook.io/docs/release-notes"  :text="t('setup.update.fullReleaseNotes')" class="text-primary" /></template>
										<template #before><strong>{{ t('setup.update.before') }}</strong></template>
									</i18n-t>
								</p>
								<p>
									<v-btn @click="updateProject" variant="flat" color="primary" size="large">
										{{ t('setup.actions.update') }}
									</v-btn>
								</p>
							</v-card-item>
						</v-card>
					</div>					

					<v-bottom-navigation id="action-bar" elevation="0" border="t" grow>
						<v-btn v-if="versionSupport.supported && info.status.imported_weather && !mobile" to="/run" :active="false">
							<v-icon>fas fa-play</v-icon> {{ t('setup.actions.run') }}
						</v-btn>
						<v-btn v-else-if="versionSupport.supported && !mobile" to="/edit" :active="false">
							<v-icon>fas fa-pencil-alt</v-icon> {{ t('setup.actions.getStarted') }}
						</v-btn>
						<v-btn v-else-if="versionSupport.updatable" @click="updateProject" :active="false">
							<v-icon>fas fa-circle-up</v-icon> {{ t('setup.actions.update') }}
						</v-btn>

						<swat-plus-toolbox-button v-if="versionSupport.supported && !info.is_lte" :text="t('components.toolbox.name')" :ran-swat="info.status.wrote_inputs"></swat-plus-toolbox-button>
						<swat-plus-iahris-button v-if="versionSupport.supported && !info.is_lte" :text="t('components.iahris.name')" :ran-swat="info.status.ran_swat"></swat-plus-iahris-button>

						<v-btn v-if="versionSupport.supported" @click="openEditProject" :active="false">
							<v-icon>fas fa-pen-to-square</v-icon> {{ t('setup.actions.rename') }}
						</v-btn>
						<v-btn v-if="versionSupport.supported && info.status.using_gis" @click="reimportGis" :active="false">
							<v-icon>fas fa-globe</v-icon> {{ t('setup.actions.reimport') }}
						</v-btn>
						<v-btn @click="page.close.removeFromRecent=false; page.close.show=true" :active="false">
							<v-icon>fas fa-circle-xmark</v-icon> {{ t('setup.actions.close') }}
						</v-btn>
						<v-btn v-if="!mobile" @click="utilities.exit" :active="false">
							<v-icon>fas fa-arrow-right-from-bracket</v-icon> {{ t('common.quit') }}
						</v-btn>
					</v-bottom-navigation>
				</v-main>
			</div>

			<v-dialog v-model="page.open.show" :max-width="constants.dialogSizes.md">
				<v-card :title="t('setup.open.title')">
					<v-card-text>
						<select-file-input v-model="page.open.projectDb" :value="page.open.projectDb" :label="t('setup.open.database')" file-type="sqlite" required :invalid-feedback="t('setup.open.required')"></select-file-input>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn :loading="page.open.loading" @click="openProject" color="primary" variant="text">{{ t('common.open') }}</v-btn>
						<v-btn @click="page.open.show = false">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.close.show" :max-width="constants.dialogSizes.md">
				<v-card :title="t('setup.close.title')">
					<v-card-text>
						<p>
							<i18n-t scope="global" keypath="setup.close.question" tag="span">
								<template #name><strong>{{currentProject.name}}</strong></template>
							</i18n-t>
						</p>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn @click="closeCurrentProject" color="primary" variant="text">{{ t('common.yes') }}</v-btn>
						<v-btn @click="page.close.show = false">{{ t('common.no') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.edit.show" :max-width="constants.dialogSizes.md">
				<v-card :title="t('setup.rename.title')">
					<v-card-text>
						<error-alert :text="page.edit.error"></error-alert>

						<v-text-field v-model="page.edit.name" :rules="[formRules.required]"
							:label="t('setup.fields.name')"></v-text-field>

						<v-text-field v-model="page.edit.description" :rules="[formRules.max(25, page.edit.description)]"
							:label="t('setup.fields.description')"
							:hint="t('setup.fields.descriptionHint')"></v-text-field>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn @click="editProject" :loading="page.edit.saving" color="primary" variant="text">{{ t('common.save') }}</v-btn>
						<v-btn @click="page.edit.show = false">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.import.show" :max-width="constants.dialogSizes.md" persistent>
				<v-card :title="t('setup.import.title')">
					<v-card-text>
						<error-alert :text="page.open.error"></error-alert>			
						<error-alert :text="page.import.error"></error-alert>
						<stack-trace-error v-if="!formatters.isNullOrEmpty(task.error)" :error-title="t('setup.import.error')" :stack-trace="task.error.toString()" />
						
						<div v-if="task.running">
							<v-progress-linear :model-value="task.progress.percent" color="primary" height="15" striped></v-progress-linear>
							<p>
								{{task.progress.message}}
							</p>
						</div>
						<div v-else-if="formatters.isNullOrEmpty(task.error)">
							<p>
								{{ t('setup.import.introduction') }}
							</p>

							<v-form>
								<v-text-field v-model="page.import.project.name" :rules="[formRules.required]"
									:label="t('setup.fields.name')"></v-text-field>

								<v-text-field v-model="page.import.project.description" :rules="[formRules.max(25, page.edit.description)]"
									:label="t('setup.fields.description')"
									:hint="t('setup.fields.descriptionHint')"></v-text-field>

								<v-checkbox v-if="false" v-model="page.import.project.isLte" class="mt-4">
									<template #label>
										{{ t('setup.lteDescription') }}
									</template>
								</v-checkbox>
							</v-form>
						</div>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn v-if="formatters.isNullOrEmpty(task.error)" :loading="task.running" @click="importProject" color="primary" variant="text">{{ t('common.start') }}</v-btn>
						<v-btn @click="cancelTask">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.loadScenario.show" :max-width="constants.dialogSizes.md" persistent>
				<v-card :title="t('setup.scenario.title')">
					<v-card-text>
						<error-alert :text="page.loadScenario.error"></error-alert>
						<stack-trace-error v-if="!formatters.isNullOrEmpty(task.error)" :error-title="t('setup.scenario.error')" :stack-trace="task.error.toString()" />
						
						<div v-if="task.running">
							<v-progress-linear :model-value="task.progress.percent" color="primary" height="15" striped></v-progress-linear>
							<p>
								{{task.progress.message}}
							</p>
						</div>
						<div v-else-if="formatters.isNullOrEmpty(task.error)">
							<p>
								<i18n-t scope="global" keypath="setup.scenario.question" tag="span">
									<template #name><strong>{{page.loadScenario.scenario.name}}</strong></template>
									<template #replace><strong class="text-error">{{ t('setup.scenario.replace') }}</strong></template>
									<template #runScreen><router-link to="/run" class="text-primary">{{ t('setup.scenario.runScreen') }}</router-link></template>
								</i18n-t>
							</p>
							<p>
								<i18n-t scope="global" keypath="setup.scenario.warning" tag="span">
									<template #warning><strong class="text-error">{{ t('setup.scenario.warningLabel') }}</strong></template>
								</i18n-t>
							</p>
						</div>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn v-if="formatters.isNullOrEmpty(task.error)" :loading="task.running" @click="loadScenario" color="primary" variant="text">{{ t('setup.scenario.title') }}</v-btn>
						<v-btn @click="cancelTask">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.create.show" :max-width="constants.dialogSizes.lg" persistent>
				<v-card :title="t('setup.create.title')">
					<v-card-text>
						<stack-trace-error v-if="!formatters.isNullOrEmpty(task.error)" :error-title="t('setup.create.error')" :stack-trace="task.error.toString()" />
						
						<div v-if="task.running">
							<v-progress-linear :model-value="task.progress.percent" color="primary" height="15" striped></v-progress-linear>
							<p>
								{{task.progress.message}}
							</p>
						</div>
						<div v-else-if="formatters.isNullOrEmpty(task.error)">
							<p>
								<i18n-t scope="global" keypath="setup.create.recommendation" tag="span">
									<template #website><open-in-browser url="https://swat.tamu.edu/software/plus/"  :text="t('setup.create.website')" /></template>
								</i18n-t>
							</p>
							<p>
								{{ t('setup.create.manual') }}
							</p>

							<error-alert :text="page.create.error"></error-alert>

							<v-form>
								<v-text-field v-model="page.create.name" :rules="[formRules.required]" class="mb-3"
									:label="t('setup.fields.name')"></v-text-field>

								<v-text-field v-model="page.create.description" :rules="[formRules.max(25, page.edit.description)]" class="mb-3"
									:label="t('setup.fields.description')"
									:hint="t('setup.fields.descriptionHint')"></v-text-field>

								<select-folder-input v-model="page.create.projectFolder" :value="page.create.projectFolder" class="mb-3"
									:label="t('setup.create.folder')"
									:hint="t('setup.create.folderHint')" persistent-hint
									required :invalidFeedback="t('setup.create.folderRequired')"></select-folder-input>

								<select-file-input v-model="page.create.datasetsDb" :value="page.create.datasetsDb" class="mb-3"
									:label="t('setup.create.datasets')"
									:hint="t('setup.create.datasetsHint')" persistent-hint
									fileType="sqlite" required 
									:invalidFeedback="t('setup.create.datasetsRequired')"></select-file-input>

								<v-checkbox v-if="false" v-model="page.create.isLte" class="mt-4">
									<template #label>
										{{ t('setup.lteDescription') }}
									</template>
								</v-checkbox>
							</v-form>
						</div>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn v-if="formatters.isNullOrEmpty(task.error)" :loading="page.create.loading || task.running" @click="createProject" color="primary" variant="text">{{ t('common.create') }}</v-btn>
						<v-btn @click="cancelTask">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.openConfirm.show" :max-width="constants.dialogSizes.md" persistent>
				<v-card :title="t('setup.reimport.title')">
					<v-card-text>
						<stack-trace-error v-if="!formatters.isNullOrEmpty(task.error)" :error-title="t('setup.reimport.error')" :stack-trace="task.error.toString()" />
						
						<div v-if="task.running">
							<v-progress-linear :model-value="task.progress.percent" color="primary" height="15" striped></v-progress-linear>
							<p>
								{{task.progress.message}}
							</p>
						</div>
						<div v-else-if="formatters.isNullOrEmpty(task.error)">
							<p v-if="!page.openConfirm.reimportMessage">
								{{ t('setup.reimport.question') }}
							</p>
							<p v-else>
								{{ t('setup.reimport.explicitQuestion') }}
							</p>

							<v-checkbox v-if="page.existingIsLte" v-model="page.openConfirm.project.isLte" class="mt-4">
								<template #label>
									{{ t('setup.lteDescription') }}
								</template>
							</v-checkbox>
						</div>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn @click="confirmOpen" color="primary" variant="text">{{ t('setup.reimport.continue') }}</v-btn>
						<v-btn v-if="formatters.isNullOrEmpty(task.error)" :loading="task.running" @click="reImportProject" color="primary" variant="text">{{ t('setup.reimport.confirm') }}</v-btn>
						<v-btn v-if="task.running || !formatters.isNullOrEmpty(task.error)" @click="cancelTask">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.update.show" :max-width="constants.dialogSizes.md" persistent>
				<v-card :title="t('setup.update.title')">
					<v-card-text>
						<error-alert :text="page.update.error"></error-alert>
						<stack-trace-error v-if="!formatters.isNullOrEmpty(task.error)" :error-title="t('setup.update.error')" :stack-trace="task.error.toString()" />
						
						<div v-if="task.running">
							<v-progress-linear :model-value="task.progress.percent" color="primary" height="15" striped></v-progress-linear>
							<p>
								{{task.progress.message}}
							</p>
						</div>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn @click="cancelTask">{{ t('common.cancel') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="page.noProject.show" :max-width="constants.dialogSizes.md">
				<v-card :title="t('setup.missing.title')">
					<v-card-text>
						<p>
							{{ t('setup.missing.description') }}
						</p>
					</v-card-text>
					<v-divider></v-divider>
					<v-card-actions>
						<v-btn @click="page.noProject.show = false">{{ t('common.ok') }}</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>
		</div>
		
		<router-view></router-view>
	</div>
</template>
