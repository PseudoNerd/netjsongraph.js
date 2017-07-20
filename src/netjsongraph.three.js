/**
 * @fileOverview
 * @name netjsongraph.three.js<src>
 * @author GeekPlux
 * @license BSD 3-clause
 * @version 0.1.2
 */
import * as d3 from 'd3';
import * as THREE from 'three';
import 'normalize.css';  /* eslint-disable */
import './netjsongraph.three.css';
import EventsController from './events_controller.js';
import { colour, promisify, isFunc } from './utils.js';

const defaultWidth = window.innerWidth;
const defaultHeight = window.innerHeight;

/**
 * Default options
 * @param  {string}     el                  "body"      The container element
 * @param  {boolean}    metadata            true        Display NetJSON metadata at startup?
 * @param  {boolean}    defaultStyle        true        Use default css style?
 * @param  {array}      scaleExtent         [0.25, 5]   The zoom scale's allowed range. @see {@link https://github.com/d3/d3-zoom#zoom_scaleExtent}
 * @param  {int}        linkDistance        50          The target distance between linked nodes to the specified value. @see {@link https://github.com/d3/d3-force/#link_distance}
 * @param  {float}      linkStrength        0.2         The strength (rigidity) of links to the specified value in the range. @see {@link https://github.com/d3/d3-force/#link_strength}
 * @param  {float}      theta               0.8         The Barnes–Hut approximation criterion to the specified value. @see {@link https://github.com/d3/d3-force/#manyBody_theta}
 * @param  {float}      distanceMax         100         Maximum distance between nodes over which this force is considered. @see {@link https://github.com/d3/d3-force/#manyBody_distanceMax}
 * @param  {int}        circleRadius        8           The radius of circles (nodes) in pixel
 * @param  {function}   onInit                          Callback function executed on initialization
 * @param  {function}   onLoad                          Callback function executed after data has been loaded
 * @param  {function}   onEnd                           Callback function executed when initial animation is complete
 * @param  {function}   onClickNode                     Called when a node is clicked
 * @param  {function}   onClickLink                     Called when a link is clicked
 * @param  {boolean}    initialAnimation    false       A flag to disable initial animation
 * @param  {boolean}    static              true        Is static force layout? @see {@link https://bl.ocks.org/mbostock/1667139}
 */
const defaults = {
  width: defaultWidth,
  height: defaultHeight,
  url: '',            // The NetJSON file url
  el: document.body,  // container element
  data: {},
  metadata: true,
  defaultStyle: true,
  scaleExtent: [0.25, 5],
  linkDistance: 50,
  linkStrength: 0.2,
  theta: 0.8,
  distanceMax: 100,
  circleRadius: 8,
  onInit: null,
  onLoad: null,
  onEnd: null,
  onClickNode: null,
  onClickLink: null,
  initialAnimation: false,
  static: true,

  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(0, defaultWidth, defaultHeight, 0, 1, 1000)
};

class Netjsongraph {

  /**
   * Construct function
   * @param {string} url The NetJSON file url
   * @param {Object} config
   */
  constructor (url, config) {
    this.set(config);
    this.url = url;
    this.ratio = this.width / this.height;
    this.init();
  }

  /**
   * Set properties of instance
   * @param {Object} config
   */
  set (config) {
    Object.assign(this, defaults, config);
    return this;
  }

  /**
   * Set container
   * @param {Object} el The container element
   * @returns {}
   */
  container (el) {
    this.el = el;
    return this;
  }

  /**
   * Load NetJSON data
   * @param {Object} data
   * @returns {}
   */
  load (data) {
    this.data = data;
    return this;
  }

  /**
   * Init graph
   */
  init () {
    if (isFunc(this.onInit)) this.onInit();
    this.fetch(this.url).then(() => {
      if (isFunc(this.onLoad)) this.onLoad();
      this.toggleMetadata();
      this.initNodeTooltip();
      this.switchTheme();
      this.render();
      this.enableZoom();
      window.addEventListener('resize', this.onWindowResize.bind(this), false);
    });
  }

  /**
   * Fetch data from url
   * @param {string} url The NetJSON file url
   */
  fetch (url) {
    if (this.url !== url) this.url = url;
    const fetchJson = promisify(d3, d3.json);
    return fetchJson(this.url)
      .then((data) => { this.data = data; },
            (err) => { if (err) throw err; });
  }

  /**
   * Toggle metadata information panel
   */
  toggleMetadata () {
    const metaDom = d3.select('#metadata');

    /**
     * Check whether it is showed on canvas
     */
    if (document.getElementById('metadata')) {
      if (metaDom.style('display') === 'none') {
        metaDom.style('display', 'block');
      } else metaDom.style('display', 'none');
      return;
    }

    const metaDomStr = `
      <div class="metadata" id="metadata">
        <ul class="meta-list">
          <li class="meta-item label"><strong>Label</strong>: ${this.data.label}</li>
          <li class="meta-item metric"><strong>Metric</strong>: ${this.data.metric}</li>
          <li class="meta-item protocol"><strong>Protocol</strong>: ${this.data.protocol}</li>
          <li class="meta-item version"><strong>Version</strong>: ${this.data.version}</li>
          <li class="meta-item nodes"><strong>Nodes</strong>: ${this.data.nodes.length}</li>
          <li class="meta-item links"><strong>Links</strong>: ${this.data.links.length}</li>
        </ul>
        <button class="close">x</button>
      </div>
    `;

    const _div = document.createElement('div');
    _div.innerHTML = metaDomStr;
    document.querySelector('body').appendChild(_div.children[0]);

    /**
     * Get metadata Dom element again when it added into <body>
     */
    const _metaDom = d3.select('#metadata');
    _metaDom.select('.close')
      .on('click', () => _metaDom.style('display', 'none'));
  }

  /**
   * Toggle node information panel
   */
  toggleInfoPanel (node, link) {
    const infoDom = d3.select('#info-panel');

    function toggleNodeOrLink (dom) {
      if (node) {
        dom.select('#node-info').style('display', 'block');
        dom.select('#link-info').style('display', 'none');
      }
      if (link) {
        dom.select('#link-info').style('display', 'block');
        dom.select('#node-info').style('display', 'none');
      }
    }

    /**
     * Check whether it is showed on canvas
     */
    if (document.getElementById('info-panel')) {
      if (infoDom.style('display') === 'none') {
        infoDom.style('display', 'block');
      }

      toggleNodeOrLink(infoDom);

      if (node && infoDom.select('#node-id').text() !== node.id) {
        infoDom.select('#node-id').text(node.id);
        infoDom.style('display', 'block');
        return;
      }

      if (link && (infoDom.select('#link-source').text() !== link.source.id ||
                   infoDom.select('#link-target').text() !== link.target.id)) {
        infoDom.select('#link-source').text(link.source.id);
        infoDom.select('#link-target').text(link.target.id);
        return;
      }

      return;
    }

    const infoDomStr = `
      <div class="info-panel" id="info-panel">
        <div class="node-info" id="node-info">
          <h3>Node Info:</h3>
          <ul class="node-info-list">
            <li class="node-info-item id"><strong>Id</strong>: <span id="node-id">${node ? node.id : null}</span></li>
          </ul>
        </div>
        <div class="link-info" id="link-info">
          <h3>Link Info:</h3>
          <ul class="link-info-list">
            <li class="link-info-item source"><strong>source</strong>: <span id="link-source">${link ? link.source.id : null}</span></li>
            <li class="link-info-item target"><strong>target</strong>: <span id="link-target">${link ? link.target.id : null}</span></li>
          </ul>
        </div>
        <button class="close">x</button>
      </div>
    `;

    const _div = document.createElement('div');
    _div.innerHTML = infoDomStr;
    document.querySelector('body').appendChild(_div.children[0]);

    /**
     * Get metadata Dom element again when it added into <body>
     */
    const _infoDom = d3.select('#info-panel');
    _infoDom.select('.close')
      .on('click', () => _infoDom.style('display', 'none'));

    toggleNodeOrLink(_infoDom);
  }

  initNodeTooltip () {
    const nodeTooltipDomStr = `
      <div class="node-tooltip" id="node-tooltip">
        <span class="node-info-item id"><strong>Id</strong>: <span id="node-id"></span></span>
      </div>
    `;

    const _div = document.createElement('div');
    _div.innerHTML = nodeTooltipDomStr;
    document.querySelector('body').appendChild(_div.children[0]);
    d3.select('#node-tooltip')
      .style('position', 'absolute')
      .style('display', 'none');
  }

  /**
   * Toggle node tooltips
   */
  toggleNodeTooltip (node) {
    const nodeTooltip = d3.select('#node-tooltip');

    /**
     * Check whether it is showed on canvas
     */
    if (document.getElementById('node-tooltip')) {
      if (nodeTooltip.style('display') === 'none') {
        nodeTooltip
          .style('display', 'block')
          .style('left', `${node.x}px`)
          .style('top', `${this.height - node.y}px`);
        nodeTooltip.select('#node-id').text(node.id);
      } else nodeTooltip.style('display', 'none');
      return;
    }
  }

  /**
   * Change theme
   * @param {string} theme
   */
  switchTheme (theme) {
    const body = d3.select('body');
    body.classed('default', this.defaultStyle);
    body.classed(theme, !!theme);
  }

  /**
   * Enable zoom behavior
   */
  enableZoom () {
    const _this = this;
    const { camera, width, height } = this;
  }

  /**
   * Create elements in canvas
   */
  createElements () {
    const _this = this;
    const { data, scene } = this;
    data.nodes.forEach((node) => {
      node.type = 'node';

      // Primitive creation
      node.geometry = new THREE.CircleBufferGeometry(_this.circleRadius, 32);
      node.material = new THREE.MeshBasicMaterial({ color: colour(node.id) });
      node.circle = new THREE.Mesh(node.geometry, node.material);

      // Click event binding
      if (isFunc(_this.onClickNode)) {
        node.circle.on('click', _this.onClickNode(mesh));
      } else {
        node.circle.on('click', () => _this.toggleInfoPanel(node, null));
      }

      // Zoom nodes when hoverd
      node.circle.on('hover', mesh => {
        mesh.scale.set(2, 2, 2);
        _this.toggleNodeTooltip(node);
      }, mesh => {
        mesh.scale.set(1, 1, 1);
        _this.toggleNodeTooltip(node);
      });

      scene.add(node.circle);
    });

    data.links.forEach((link) => {
      link.type = 'link';

      // Primitive creation
      link.material = new THREE.LineBasicMaterial({ color: 0xAAAAAA, linewidth: 2 }); // the linewidth property in Chrome is invalid
      link.geometry = new THREE.Geometry();
      link.line = new THREE.Line(link.geometry, link.material);

      // Click event binding
      if (isFunc(_this.onClickLink)) {
        link.line.on('click', _this.onClickLink(mesh));
      } else {
        link.line.on('click', () => _this.toggleInfoPanel(null, link));
      }

      // Zoom nodes when hoverd
      link.line.on('hover', mesh => {
        console.log(mesh);
        mesh.material.color = new THREE.Color(0x666666);
      }, mesh => {
        mesh.material.color = new THREE.Color(0xAAAAAA);
      });

      scene.add(link.line);
    });
  }

  /**
   * Elements position calculation
   */
  calculateElementsPosition () {
    const { data } = this;
    data.nodes.forEach((node) => {
      const { x, y, circle } = node;
      circle.position.set(x, y, 0);
    });

    data.links.forEach((link) => {
      const { source, target, line } = link;
      line.geometry.verticesNeedUpdate = true;
      line.geometry.vertices[0] = new THREE.Vector3(source.x, source.y, -1);
      line.geometry.vertices[1] = new THREE.Vector3(target.x, target.y, -1);
      // set z axis value -1 is to make line behind the node
    });
  }

  /**
   * Render force layout
   */
  render () {
    const _this = this;
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true   // perform antialiasing
    });
    const { width, height, data, scene, camera, renderer } = this;
    renderer.setSize(width, height);
    this.el.appendChild(renderer.domElement);
    camera.position.z = 5;
    this.controller = new EventsController({
      dom: renderer.domElement,
      scene: scene,
      camera: camera
    });
    this.createElements();

    /**
     * set link force options
     */
    function forceLink () {
      return d3.forceLink()
        .id(d => d.id)
        .distance(_this.linkDistance)
        .strength(_this.linkStrength);
    }

    /**
     * set many-body force options
     */
    function forceManyBody () {
      return d3.forceManyBody()
        .theta(_this.theta)
        .distanceMax(_this.distanceMax);
    }

    /**
     * set nodes positions and velocities
     */
    const simulation = d3.forceSimulation()
          .force('link', forceLink())
          .force('charge', forceManyBody())  // custom distance max value
          .force('center', d3.forceCenter(width / 2, height / 2));

    /**
     * Start to calculate force
     */
    simulation.nodes(data.nodes);
    simulation.force('link')
      .links(data.links);

    if (_this.static) staticRender();
    else dynamicRender();

    function staticRender () {
      // See https://github.com/d3/d3-force/blob/master/README.md#simulation_tick
      for (var i = 0, n = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())); i < n; ++i) {
        simulation.tick();
      }
      _this.calculateElementsPosition();
      render();
    }

    function dynamicRender () {
      /**
       * Running the simulation manually to disable initial animation
       */
      if (!_this.initialAnimation) {
        for (let i = 0; i < 100; ++i) {
          simulation.tick();
        }
      }

      /**
       * Bind the tick event
       */
      simulation.on('tick', ticked);

      function ticked () {
        _this.calculateElementsPosition();
        render();
      }
    }

    function render () {
      requestAnimationFrame(render);
      renderer.render(scene, camera);
    };

    /**
     * onEnd callback
     */
    if (isFunc(_this.onEnd)) _this.onEnd();
  }

  /**
   * Callback of window resize event
   */
  onWindowResize (event) {
    const _this = this;
    const { scene, camera, renderer } = _this;

    if (window.innerWidth / _this.width < window.innerHeight / _this.height) {
      renderer.setSize(window.innerWidth, window.innerWidth / _this.ratio);
    } else {
      renderer.setSize(window.innerHeight * _this.ratio, window.innerHeight);
    }

    render();

    function render () {
      requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
  }
}

export default Netjsongraph;
