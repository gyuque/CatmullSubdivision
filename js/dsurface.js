(function(aGlobal) {
	'use strict';

	function SubdivisionContext(sourceModel, viewer, fb) {
		this.viewer = viewer;
		this.surfaces = [];
		this.targetFrameBuffer = fb;
		this.viewport = this.calcViewport(fb);
		
		var nPatches = sourceModel.getPatchesCount();
		for (var i = 0;i < nPatches;i++) {
			var patch = sourceModel.getPatchAt(i);
			patch.updateTransform(viewer.viewProjectionMatrix);
			
			var srf = new DSurface();
			srf.setCoefficientsMatricies(
				patch.bicubicMs.x,
				patch.bicubicMs.y,
				patch.bicubicMs.z,
				patch.bicubicMs.w
			);
			
			this.surfaces.push(srf);
		}
	}
	
	SubdivisionContext.prototype = {
		calcViewport: function(fb) {
			var hw = fb.width / 2;
			var hh = fb.height / 2;
			
			return {
				originX: hw,
				originY: hh,
				scaleX: hw,
				scaleY: -hh
			};
		},
		
		traverse: function() {
			var ls = this.surfaces;
			var len = ls.length;
			var needMore = false;
			for (var i = 0;i < len;i++) {
				if (ls[i].traverse(this.viewport, this.targetFrameBuffer)) {
					needMore = true;
				}
			}
		},
		
		dump: function() {
			var ls = this.surfaces;
			var len = ls.length;
			var needMore = false;
			
			var sum = 0;
			for (var i = 0;i < len;i++) {
				sum += ls[i].dump(this.targetFrameBuffer);
			}
			
			console.log("-----\n"+sum+" nodes total.");
		}
	};

	function DSurface() {
		this.root = null;
		this.nodes = [];
		this.disposedNodes = [];
		this.coefficientsMatricies = {
			x: new M44(),
			y: new M44(),
			z: new M44(),
			w: new M44()
		};
		
		this.subdividedRegisters = new Array(9);
		for (var i = 0;i < 9;i++) {
			this.subdividedRegisters[i] = new SubdivisionRegister(); }
		
		this.generateInitialNodes();
	}
	
	DSurface.prototype = {
		traverse: function(viewport, frameBuffer) {
			var ls = this.nodes;
			var len = ls.length;
			var needMore = false;
			var TMAX = 200;
			var dcount = 0;
			
			for (var i = 0;i < len;i++) {
				var nd = ls[i];
				if (nd && nd.isLeaf() && nd.hasSurface() && !nd.terminated) {
					this.subdivide(nd, viewport, frameBuffer);
					if (++dcount >= TMAX){break;}
				}
			}
			
			return true;
		},
		
		dump: function(fb) {
			var ls = this.nodes;
			var len = ls.length;
			var ntCount = 0;

			for (var i = 0;i < len;i++) {
				var nd = ls[i];
				if (nd) {
					if (nd.terminated) {
						var x = (nd.bounds.xmin + nd.bounds.xmax) >> 1;
						var y = (nd.bounds.ymin + nd.bounds.ymax) >> 1;

						fb.setPixel(x, y, 255, 255, 255);
					} else {
						if (nd.hasSurface())
							++ntCount;
					}
				}
			}
			
			console.log(len+" Nodes", ntCount+" (nt)");
			
			return len;
		},
		
		setCoefficientsMatricies: function(x, y, z, w) {
			var m = this.coefficientsMatricies;
			m.x.copyFrom(x);
			m.y.copyFrom(y);
			m.z.copyFrom(z);
			m.w.copyFrom(w);
			
			this.setSubdivisionRegisters()
		},
		
		setSubdivisionRegisters: function() {
			var nd = this.root;
			this.setSubdivisionRegisterOnNode(nd.vNW, nd.rNW);
			this.setSubdivisionRegisterOnNode(nd.vNE, nd.rNE);
			this.setSubdivisionRegisterOnNode(nd.vSW, nd.rSW);
			this.setSubdivisionRegisterOnNode(nd.vSE, nd.rSE);
		},

		setSubdivisionRegisterOnNode: function(node, outRegisterSet) {
			this.setSubdivisionRegisterOfComponent(node, 'x', outRegisterSet.x);
			this.setSubdivisionRegisterOfComponent(node, 'y', outRegisterSet.y);
			this.setSubdivisionRegisterOfComponent(node, 'z', outRegisterSet.z);
			this.setSubdivisionRegisterOfComponent(node, 'w', outRegisterSet.w);
		},
		
		setSubdivisionRegisterOfComponent: function(node, component, outRegister) {
			if (!_tmpVec4) {_tmpVec4 = new Vec4();}
			var M = this.coefficientsMatricies[component];
			
			// u-v coordinate of specified node
			var u = node.u;
			var u2 = u * u;
			var u3 = u2 * u;
			
			var v = node.v;
			var v2 = v * v;
			var v3 = v2 * v;
			
			// h and k = subdivision point
			var h = 1, k = 1;
			
			// calculate register-square (see page 24-)
			//
			//  f   g
			//
			//  Cf  Cg
			//
			M.transVec4(_tmpVec4, v3, v2, v, 1);
			var f = _tmpVec4.x * u3  +  _tmpVec4.y * u2  + _tmpVec4.z * u  +  _tmpVec4.w
			//console.log(component, f)

			var g = h*h * (
			                v3 * (3 * M._11 * u + M._21) +
			                v2 * (3 * M._12 * u + M._22) +
			                v  * (3 * M._13 * u + M._23) +
			                     (3 * M._14 * u + M._24) 
			              );
			
			var Cf = k*k *(
			                3*v * (u3 * M._11 + u2 * M._21 + u * M._31 + M._41) +
			                      (u3 * M._12 + u2 * M._22 + u * M._32 + M._42)
			              );
			
			var Cg = h*h * k*k * (
			                       3*v * (3 * M._11 * u + M._21) + 
			                             (3 * M._12 * u + M._22)
			                     );
			
			outRegister.f = f;
			outRegister.g = g;
			outRegister.Cf = Cf;
			outRegister.Cg = Cg;
		},

		generateInitialNodes: function() {
			this.root = this.requestNode(0.5, 0.5);
			
			this.root.vNW = this.requestNode(0, 0);
			this.root.vNE = this.requestNode(1, 0);
			this.root.vSW = this.requestNode(0, 1);
			this.root.vSE = this.requestNode(1, 1);
		},
		
		requestNode: function(u, v) {
			if (this.disposedNodes.length > 0) {
				var reusedNode = this.disposedNodes.pop();
				//var oldIndex = reusedNode.index;
				//this.nodes[oldIndex] = reusedNode;
				reusedNode.init(u, v);
				
				reusedNode.index = this.nodes.length;
				this.nodes.push(reusedNode);
				
				return reusedNode;
			}
			
			var n = new DSNode(u, v);
			n.index = this.nodes.length;
			this.nodes.push(n);
			return n;
		},
		
		disposeNode: function(n) {
			if (n == this.root) {this.root = null;}
			this.nodes[n.index] = null;
			this.disposedNodes.push(n);
		},
		
		subdivide: function(centerNode, viewport, frameBuffer) {
			if (centerNode.cNW || centerNode.cNE || centerNode.cSW || centerNode.cSE) {
				throw "Node is already subdivided.";
			}
			
			// Generate "middle of edge" nodes
			var west  = this.requestNode(centerNode.vNW.u, midp(centerNode.vNW.v, centerNode.vSW.v));
			var east  = this.requestNode(centerNode.vNE.u, midp(centerNode.vNE.v, centerNode.vSE.v));
			var north = this.requestNode(midp(centerNode.vNW.u, centerNode.vNE.u), centerNode.vNW.v);
			var south = this.requestNode(midp(centerNode.vSW.u, centerNode.vSE.u), centerNode.vSW.v);
			
			// Generate "center of child surface" nodes
			centerNode.cNW = this.requestNode(midp(west.u, centerNode.u), midp(north.v, centerNode.v));
			centerNode.cNE = this.requestNode(midp(east.u, centerNode.u), midp(north.v, centerNode.v));
			centerNode.cSW = this.requestNode(midp(west.u, centerNode.u), midp(south.v, centerNode.v));
			centerNode.cSE = this.requestNode(midp(east.u, centerNode.u), midp(south.v, centerNode.v));
			
			// Set vertices on child nodes
			centerNode.cNW.vNW = centerNode.vNW;
			centerNode.cNW.vSW = west;
			centerNode.cNW.vNE = north;
			centerNode.cNW.vSE = centerNode;
			
			centerNode.cNE.vNE = centerNode.vNE;
			centerNode.cNE.vSE = east;
			centerNode.cNE.vNW = north;
			centerNode.cNE.vSW = centerNode;
			
			centerNode.cSW.vSW = centerNode.vSW;
			centerNode.cSW.vNW = west;
			centerNode.cSW.vSE = south;
			centerNode.cSW.vNE = centerNode;
			
			centerNode.cSE.vSE = centerNode.vSE;
			centerNode.cSE.vNE = east;
			centerNode.cSE.vSW = south;
			centerNode.cSE.vNW = centerNode;
			
			
			// Calculate register-square of child nodes
			this.calcSubdividedRegisters(centerNode, 'x');
			this.copySubdividedRegisters(centerNode, 'x');

			this.calcSubdividedRegisters(centerNode, 'y');
			this.copySubdividedRegisters(centerNode, 'y');

			this.calcSubdividedRegisters(centerNode, 'z');
			this.copySubdividedRegisters(centerNode, 'z');

			this.calcSubdividedRegisters(centerNode, 'w');
			this.copySubdividedRegisters(centerNode, 'w');
			
			// Check fragment size
			
			centerNode.cNW.calcBounds(viewport);
			centerNode.cNE.calcBounds(viewport);
			centerNode.cSW.calcBounds(viewport);
			centerNode.cSE.calcBounds(viewport);
			
			centerNode.cNW.checkTermination(viewport);
			centerNode.cNE.checkTermination(viewport);
			centerNode.cSW.checkTermination(viewport);
			centerNode.cSE.checkTermination(viewport);
			
			//this.disposeNode(centerNode);
			
			this.outputTerminatedNode(centerNode.cNW, frameBuffer);
			this.outputTerminatedNode(centerNode.cNE, frameBuffer);
			this.outputTerminatedNode(centerNode.cSW, frameBuffer);
			this.outputTerminatedNode(centerNode.cSE, frameBuffer);
			
			// console.log([west,east,north,south].join("\n"));
			// console.log([centerNode.cNW, centerNode.cNE, centerNode.cSW, centerNode.cSE].join("\n"));
		},
		
		outputTerminatedNode: function(nd, frameBuffer) {
			if (nd.terminated) {
				var x = (nd.bounds.xmin + nd.bounds.xmax) >> 1;
				var y = (nd.bounds.ymin + nd.bounds.ymax) >> 1;

				frameBuffer.setPixel(x, y, 255, 255, 255);

				this.disposeNode(nd);
			}
		},
		
		calcChildCornerRegister: function(parentRegister, childRegister) {
			childRegister.f  = parentRegister.f;
			childRegister.g  = parentRegister.g / 4;
			childRegister.Cf = parentRegister.Cf / 4;
			childRegister.Cg = parentRegister.Cg / 16;
		},
		
		copySubdividedRegisters: function(parentNode, c /* component name */ ) {
			var S = this.subdividedRegisters;
			
			var cNW = parentNode.cNW;
			var cNE = parentNode.cNE;
			var cSW = parentNode.cSW;
			var cSE = parentNode.cSE;

			cNW.rNW[c].cp(S[0]); cNW.rNE[c].cp(S[1]);  cNE.rNW[c].cp(S[1]); cNE.rNE[c].cp(S[2]);
			cNW.rSW[c].cp(S[3]); cNW.rSE[c].cp(S[4]);  cNE.rSW[c].cp(S[4]); cNE.rSE[c].cp(S[5]);
			
			cSW.rNW[c].cp(S[3]); cSW.rNE[c].cp(S[4]);  cSE.rNW[c].cp(S[4]); cSE.rNE[c].cp(S[5]);
			cSW.rSW[c].cp(S[6]); cSW.rSE[c].cp(S[7]);  cSE.rSW[c].cp(S[7]); cSE.rSE[c].cp(S[8]);
		},
		
		calcSubdividedRegisters: function(parentNode, component) {
			var efgh = parentNode.rNW[component];
			var e = efgh.f;   var f = efgh.g;
			var g = efgh.Cf;  var h = efgh.Cg;

			var abcd = parentNode.rSW[component];
			var a = abcd.f;   var b = abcd.g;
			var c = abcd.Cf;  var d = abcd.Cg;

			var ijkl = parentNode.rNE[component];
			var i = ijkl.f;   var j = ijkl.g;
			var k = ijkl.Cf;  var l = ijkl.Cg;
			
			var mnop = parentNode.rSE[component];
			var m = mnop.f;   var n = mnop.g;
			var o = mnop.Cf;  var p = mnop.Cg;
			
			var S = this.subdividedRegisters;
			S[0].setAll(
				e  , f/4,
			 	g/4, h/16
			);
//console.log(">>",(e+i)/2, (f+j)/8);
			S[1].setAll(
				(e+i)/2 - (f+j)/8    , (f+j)/8,
				((g+k)/2 - (h+l)/8)/4, (h+l)/32
			);

			S[2].setAll(
				i  , j/4 ,
				k/4, l/16
			);
			
			// ------------------
			
			S[3].setAll(
				(a+e)/2-(c+g)/8 , ((b+f)/2-(d+h)/8)/4,
				(c+g)/8         , (d+h)/32
			);

			S[4].setAll(
				((a+e)/2-(c+g)/8 + (i+m)/2-(k+o)/8)/2 - ((b+f)/2-(d+h)/8 + (j+n)/2-(l+p)/8)/8,
				((b+f)/2-(d+h)/8 + (j+n)/2-(l+p)/8)/8,
				((c+g)/8 + (k+o)/8)/2 - ((d+h)/8 + (l+p)/8)/8,
				((d+h)/8 + (l+p)/8)/8
			);
			
			S[5].setAll(
				(i+m)/2-(k+o)/8 , ((j+n)/2-(l+p)/8)/4,
				(k+o)/8         , (l+p)/32
			);

			// ------------------

			S[6].setAll(
				a  , b/4 ,
				c/4, d/16
			);
			
			S[7].setAll(
				(a+m)/2-(b+n)/8      , (b+n)/8,
				((c+o)/2 - (d+p)/8)/4, (d+p)/32
			);

			S[8].setAll(
				m  , n/4,
				o/4, p/16
			);
			
			//console.log(S)
		}
	};
	
	function DSNode(u, v) {
		this.init(u, v);

		// Subdivision registers
		this.rNW = new SubdivisionRegisterSet();
		this.rNE = new SubdivisionRegisterSet();
		this.rSW = new SubdivisionRegisterSet();
		this.rSE = new SubdivisionRegisterSet();
	}
	
	DSNode.prototype = {
		init: function(u, v) {
			this.index = -1;
			this.u = u;
			this.v = v;
			this.terminated = false;
			this.bounds = null;

			// Vertex nodes
			this.vNW = null;
			this.vNE = null;
			this.vSW = null;
			this.vSE = null;

			// Child (center) nodes
			this.cNW = null;
			this.cNE = null;
			this.cSW = null;
			this.cSE = null;
		},
		
		calcBounds: function(viewport) {
			var xmin = 9999;
			var ymin = 9999;
			var xmax = -9999;
			var ymax = -9999;
			var sx, sy, rs;
			
			// written as inline for speed
			
			rs = this.rNW;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}
			
			rs = this.rNE;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}

			rs = this.rSW;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}

			rs = this.rSE;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}
			
			// ----------------------------------------
			
			xmin = viewport.originX + xmin * viewport.scaleX;
			ymin = viewport.originY + ymin * viewport.scaleY;
			xmax = viewport.originX + xmax * viewport.scaleX;
			ymax = viewport.originY + ymax * viewport.scaleY;
			
			this.bounds = {
				/* Reverse Y */
				xmin: xmin, ymin: ymax,
				xmax: xmax, ymax: ymin,
				w: xmax - xmin,
				h: ymin - ymax
			};
			
			return this.bounds;
		},
		
		checkTermination: function() {
			var bd = this.bounds;
			if (bd.w >= 1 || bd.h >= 1) {
				return false;
			}
			
			if (this.countCoveringPoints() >= 2) {
				return false;
			}

			this.terminated = true;
			return true;
		},
		
		countCoveringPoints: function() {
			var bd = this.bounds;
			var sx = Math.floor(bd.xmin) + 0.5;
			var y = Math.floor(bd.ymin) + 0.5;
			var xmax = bd.xmax;
			var ymax = bd.ymax;

			var rs;
			
			rs = this.rNW;
			var sx1 = rs.x.f / rs.w.f;
			var sy1 = rs.y.f / rs.w.f;

			rs = this.rNE;
			var sx2 = rs.x.f / rs.w.f;
			var sy2 = rs.y.f / rs.w.f;

			rs = this.rSW;
			var sx3 = rs.x.f / rs.w.f;
			var sy3 = rs.y.f / rs.w.f;

			rs = this.rSE;
			var sx4 = rs.x.f / rs.w.f;
			var sy4 = rs.y.f / rs.w.f;
			var count = 0;

			for (;y <= ymax;y += 1){
				for (var x = sx;x <= xmax;x += 1) {
					if (checkTriangleInclude(
						sx1, sy1,
						sx2, sy2,
						sx3, sy3,
						x, y)) {
						++count;
					}
					
					if (checkTriangleInclude(
								sx3, sy3,
								sx2, sy2,
								sx4, sy4,
								x, y)) {
						++count;
					}
					
					if (count >= 2) {
						console.log(count);
						return 2;
					}
				}
			}
			
			return count;
		},
		
		toString: function() {
			return "DSNode<"+this.u+", "+this.v+">";
		},
		
		isLeaf: function() {
			return !this.cNW;
		},
		
		hasSurface: function() {
			return !!this.vNW;
		},
		
		generateSubdivisionRegisterSet: function() {
			return {
				x: new SubdivisionRegister(),
				y: new SubdivisionRegister(),
				z: new SubdivisionRegister(),
				w: new SubdivisionRegister()
			}
		}
	};
	
	function SubdivisionRegisterSet() {
		this.x = new SubdivisionRegister();
		this.y = new SubdivisionRegister();
		this.z = new SubdivisionRegister();
		this.w = new SubdivisionRegister();
	}
	
	function SubdivisionRegister() {
		this.f = 1;  this.g = 1;
		this.Cf = 1; this.Cg = 1;
	}
	
	SubdivisionRegister.prototype = {
		setAll: function(f, g, Cf, Cg) {
			this.f = f;  this.g = g;
			this.Cf = Cf; this.Cg = Cg;
		},
		
		cp: function (r) {
			this.f = r.f;  this.g = r.g;
			this.Cf = r.Cf; this.Cg = r.Cg;
		}
	};

	function checkLineCross(
			x1, y1,
			x2, y2,
			x3, y3,
			x4, y4) {

		if (
				((x1 - x2) * (y3 - y1) + (y1 - y2) * (x1 - x3)) *
				((x1 - x2) * (y4 - y1) + (y1 - y2) * (x1 - x4)) <= 0
			) {

			if (
					((x3 - x4) * (y1 - y3) + (y3 - y4) * (x3 - x1)) *
	            	((x3 - x4) * (y2 - y3) + (y3 - y4) * (x3 - x2)) <= 0
			) {
				return true;
			}
		}

		return false;
	}
	
	function checkTriangleInclude(
			x1, y1,
			x2, y2,
			x3, y3,

			px, py) {

		var cx = (x1+x2+x3) / 3.0;
		var cy = (y1+y2+y3) / 3.0;

		if (checkLineCross(x1,y1, x2,y2, px,py, cx,cy)) return false;
		if (checkLineCross(x1,y1, x3,y3, px,py, cx,cy)) return false;
		if (checkLineCross(x2,y2, x3,y3, px,py, cx,cy)) return false;

		return true;
	}

	function midp(a, b) {return (a+b)*0.5}
	var _tmpVec4 = null;
	aGlobal.SubdivisionContext = SubdivisionContext;
	aGlobal.DSurface = DSurface;
})(window);