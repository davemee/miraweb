import React from "react";

import * as PIXI from "pixi.js";
import tinycolor from "tinycolor2";
import debounce from "lodash/debounce.js";

import { TAB_COLOR_CHANGE_AMT, TAB_COLOR_MODES } from "../lib/constants.js";
import * as FocusActions from "../actions/focus.js";
import { setScale, setDOMRect } from "../actions/activeFrame.js";

import ActiveFrameStore from "../stores/activeFrame.js";
import FrameStore from "../stores/frame.js";
import PatcherStore from "../stores/patcher.js";
import PopoverStore from "../stores/popover.js";
import UIObjectStore from "../stores/uiObject.js";
import SettingsStore from "../stores/settings.js";

import AnimationController from "../lib/animation.js";

import Background from "./background.jsx";

function sortByZ(a, b) {
	if (a.zIndex < b.zIndex) return -1;
	if (a.zIndex > b.zIndex) return 1;
	return 0;
}
const BASE_CLASS = "mw-pixi";

export default class PixiView extends React.Component {

	constructor(props) {
		super(props);

		this.state = this._buildState();

		this._canvas = null;
		this._container = null;
		this._popovers = {};
		this._renderer = null;

		this._stage = new PIXI.Container();
		this._stage.interactive = true;
		this._stage.on("mousedown", this._onBackgroundClick.bind(this));
		this._stage.on("touchstart", this._onBackgroundClick.bind(this));
		this._objectStage = new PIXI.Container();
		this._objectStage.interactive = true;
		this._popoverStage = new PIXI.Container();
		this._stage.addChild(this._objectStage);
		this._stage.addChild(this._popoverStage);

		this._unsubscribes = [];
		this._unsubscribes.push(ActiveFrameStore.on("tint", this._tint.bind(this)));
		this._unsubscribes.push(ActiveFrameStore.on("resize", this._onResize.bind(this)));
		this._unsubscribes.push(ActiveFrameStore.on("viewmode_change", this._onResize.bind(this)));
		this._unsubscribes.push(ActiveFrameStore.on("set", this._onSetActiveFrame.bind(this)));

		this._unsubscribes.push(FrameStore.on("frame_removed", this._onFrameRemoved.bind(this)));

		this._unsubscribes.push(PatcherStore.on("patcher_tint", this._onPatcherTint.bind(this)));

		this._unsubscribes.push(PopoverStore.on("showPopover", this._onShowPopover.bind(this)));
		this._unsubscribes.push(PopoverStore.on("hidePopover", this._onHidePopover.bind(this)));

		this._unsubscribes.push(UIObjectStore.on("clear", this._onClear.bind(this)));
		this._unsubscribes.push(UIObjectStore.on("object_added", this._onAddObject.bind(this)));

		this._unsubscribes.push(SettingsStore.on("change_setting", this._onSettingsChange.bind(this)));
		this._sortObjectsByZIndex = debounce(this._sortObjectsByZIndex, 150, {
			leading : false,
			trailing : true
		}).bind(this);
	}

	componentDidMount() {
		this._onClear();
		this._renderer = new PIXI.autoDetectRenderer(400, 300, {
			view : this._canvas,
			antialias : true,
			resolution : ActiveFrameStore.getResolution(),
			transparent : true,
			autoResize : true,
			roundPixels : true
		});

		window.addEventListener("resize", this._onResize.bind(this));
		this._requestAnimationFrame();
	}

	componentWillUnmount() {
		this._unsubscribes.forEach((f) => {
			f();
		});
	}

	componentDidUpdate() {
		setDOMRect(this._canvas.getBoundingClientRect());
	}

	_buildState() {
		return {
			canvasX : 0,
			canvasY : 0,
			hidden : true,
			canvasBgColor : "transparent"
		};
	}

	_onAddObject(uiObject) {
		this._objectStage.addChild(uiObject.displayElement);
		this._sortObjectsByZIndex();
		uiObject.on("zindex_changed", this._sortObjectsByZIndex);
	}

	_sortObjectsByZIndex() {
		this._objectStage.children.sort(sortByZ);
	}

	_onBackgroundClick(e) {
		if (e.data.target === this._stage || e.target === this._stage) {
			FocusActions.focus(null);
		}
	}

	_onClear() {
		// this._popoverStage.removeChildren();
		this._objectStage.removeChildren();
	}

	_onPatcherTint(patcher) {
		if (ActiveFrameStore.hasActiveFrame() && ActiveFrameStore.getFrame().patcherId === patcher.id) this._tint();
	}

	_onFrameRemoved() {
		this.setState({
			hidden : FrameStore.getFrameCount() === 0
		});

		this._tint();
	}

	_onSetActiveFrame() {
		this.setState({
			hidden : false
		});
		this._tint();
		this._onResize();
	}

	_onSettingsChange(setting, value) {
		if (setting === "tabColorMode" || setting === "tabColor") this._tint();
	}

	_onRemoveObject(node) {
		this._objectStage.removeChild(node);
	}

	_onResize() {
		if (!this._container || !this._renderer) return;

		const rect = ActiveFrameStore.getDimensions();
		if (!rect) return;
		const width = rect[2];
		const height = rect[3];

		const containerRect = this._container.getBoundingClientRect();

		const scale = Math.min(containerRect.width / width, containerRect.height / height);
		const alignedWidth = Math.round(width * scale);
		const alignedHeight = Math.round(height * scale);

		this._renderer.resize(alignedWidth, alignedHeight);
		this._stage.hitArea = new PIXI.Rectangle(0, 0, alignedWidth, alignedHeight);
		setScale(scale);
		this.setState({
			canvasX : ~~((containerRect.width - alignedWidth) / 2),
			canvasY : ~~((containerRect.height - alignedHeight) / 2)
		});
	}

	_onHidePopover(popover) {
		this._popoverStage.removeChild( popover.return_node() );
	}

	_onShowPopover(popover) {
		this._popoverStage.addChild( popover.return_node() );
	}

	_requestAnimationFrame() {
		window.requestAnimationFrame(this._refresh.bind(this));
	}

	_refresh(timestamp) {
		UIObjectStore.getObjects().forEach((object) => {
			if (object.needsRender) object.render();
		});
		this._renderer.render(this._stage);
		AnimationController.update(timestamp);
		this._requestAnimationFrame();
	}

	_tint() {
		const bgColor = ActiveFrameStore.getBackgroundColor();
		let formattedColor = tinycolor.fromRatio({
			r : bgColor[0],
			g : bgColor[1],
			b : bgColor[2]
		});

		const canvasBgColor = formattedColor.toHexString();

		// set tab bg according to current setting
		const tabColorMode = SettingsStore.getSettingState("tabColorMode");
		let tabBgColor;
		switch (tabColorMode) {
			case TAB_COLOR_MODES.COLOR:
				tabBgColor = SettingsStore.getSettingState("tabColor");
				tabBgColor = tinycolor.fromRatio({
					r : tabBgColor[0],
					g : tabBgColor[1],
					b : tabBgColor[2]
				});
				break;
			case TAB_COLOR_MODES.DARKEN:
				tabBgColor = formattedColor.darken(TAB_COLOR_CHANGE_AMT);
				break;
			case TAB_COLOR_MODES.LIGHTEN:
			default:
				tabBgColor = formattedColor.lighten(TAB_COLOR_CHANGE_AMT);
				break;
		}

		// we also set an actual DOM background color
		this.setState({
			canvasBgColor : canvasBgColor,
			bgColor : tabBgColor.toHexString()
		});
	}

	render() {

		return (
			<div className={ `${BASE_CLASS}-container`} ref={ (ref) => this._container = ref } >
				<Background bgColor={ this.state.bgColor || null } />
				<canvas
					className={ this.state.hidden ? "hidden" : "" }
					ref={ (ref) => this._canvas = ref }
					style={ { left : this.state.canvasX, top : this.state.canvasY, backgroundColor : this.state.canvasBgColor } }
				/>
			</div>
		);
	}
}
