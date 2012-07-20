(function(aGlobal) {
	'use strict';
	var vLight;

	function SubdivisionContext(sourceModel, viewer, fb) {
		vLight = new Vec4(-1, 1, -0.5);
		vLight.normalize3();
		
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
			var ls = activeNodes;
			var len = ls.length;
			var needMore = false;
			var TMAX = 2000;
			var dcount = 0;
				
			for (var i = 0;i < len;i++) {
				var nd = ls[i];
				if (nd && !nd.terminated) {
					nd.owner.subdivide(nd, this.viewport, this.targetFrameBuffer);
					needMore = true;
					if (++dcount >= TMAX){break;}
				}
			}
			
			
			return needMore;
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
		this.tmpNodes = [];
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
		
		compressList: function() {
			var tls = this.tmpNodes;
			tls.length = 0;
			
			var ls = this.nodes;
			var len = ls.length;
			var i;
			for (i = 0;i < len;i++) {
				var nd = ls[i];
				if (nd) {
					tls.push(nd);
				}
			}
			
			len = tls.length;
			ls.length = len;
			for (i = 0;i < len;i++) {
				ls[i] = tls[i];
				ls[i].index = i;
			}
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
						if (nd.bounds) {
							var x = (nd.bounds.xmin + nd.bounds.xmax) >> 1;
							var y = (nd.bounds.ymin + nd.bounds.ymax) >> 1;

							fb.setPixel(x, y, 255, 25, 0);
							
						}
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
			this.setSubdivisionRegisterOnNode(nd.rNW, 0, 0);
			this.setSubdivisionRegisterOnNode(nd.rNE, 1, 0);
			this.setSubdivisionRegisterOnNode(nd.rSW, 0, 1);
			this.setSubdivisionRegisterOnNode(nd.rSE, 1, 1);
		},

		setSubdivisionRegisterOnNode: function(outRegisterSet, u, v) {
			this.setSubdivisionRegisterOfComponent('x', outRegisterSet.x, u, v);
			this.setSubdivisionRegisterOfComponent('y', outRegisterSet.y, u, v);
			this.setSubdivisionRegisterOfComponent('z', outRegisterSet.z, u, v);
			this.setSubdivisionRegisterOfComponent('w', outRegisterSet.w, u, v);
		},
		
		setSubdivisionRegisterOfComponent: function(component, outRegister, u, v) {
			if (!_tmpVec4) {_tmpVec4 = new Vec4();}
			var M = this.coefficientsMatricies[component];
			
			// u-v coordinate of specified node
			var u2 = u * u;
			var u3 = u2 * u;
			
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
			this.root = requestNode(this);
		},
		
		subdivide: function(centerNode, viewport, frameBuffer) {
			if (centerNode.cNW || centerNode.cNE || centerNode.cSW || centerNode.cSE) {
				throw "Node is already subdivided.";
			}
			
			// Generate "center of child surface" nodes
			var cNW = requestNode(this);
			var cNE = requestNode(this);
			var cSW = requestNode(this);
			var cSE = requestNode(this);
	
			// Calculate register-square of child nodes
			this.calcSubdividedRegisters(centerNode, 'x');
			this.copySubdividedRegisters(centerNode, 'x', cNW, cNE, cSW, cSE);

			this.calcSubdividedRegisters(centerNode, 'y');
			this.copySubdividedRegisters(centerNode, 'y', cNW, cNE, cSW, cSE);

			this.calcSubdividedRegisters(centerNode, 'z');
			this.copySubdividedRegisters(centerNode, 'z', cNW, cNE, cSW, cSE);

			this.calcSubdividedRegisters(centerNode, 'w');
			this.copySubdividedRegisters(centerNode, 'w', cNW, cNE, cSW, cSE);
			
			// Termination
			
			cNW.calcBounds(viewport);
			cNE.calcBounds(viewport);
			cSW.calcBounds(viewport);
			cSE.calcBounds(viewport);
			
			cNW.checkTermination(viewport);
			cNE.checkTermination(viewport);
			cSW.checkTermination(viewport);
			cSE.checkTermination(viewport);
			
			disposeNode(centerNode);
			
			this.outputTerminatedNode(cNW, frameBuffer);
			this.outputTerminatedNode(cNE, frameBuffer);
			this.outputTerminatedNode(cSW, frameBuffer);
			this.outputTerminatedNode(cSE, frameBuffer);
			
			// console.log([west,east,north,south].join("\n"));
			// console.log([centerNode.cNW, centerNode.cNE, centerNode.cSW, centerNode.cSE].join("\n"));
		},
		
		outputTerminatedNode: function(nd, frameBuffer) {
			if (nd.terminated) {
				var x = (nd.bounds.xmin + nd.bounds.xmax) >> 1;
				var y = (nd.bounds.ymin + nd.bounds.ymax) >> 1;

				var dp = 0.6 + nd.calcLighting(vLight.x, vLight.y, vLight.z) * 0.4;
				var i = (dp*dp) * 255;
				if (i < 0) {i=0;}
				if (i > 255) {i=255;}

				frameBuffer.setPixel(x, y, nd.bounds.z, i, i, i);

				disposeNode(nd);
			}
		},
		
		calcChildCornerRegister: function(parentRegister, childRegister) {
			childRegister.f  = parentRegister.f;
			childRegister.g  = parentRegister.g / 4;
			childRegister.Cf = parentRegister.Cf / 4;
			childRegister.Cg = parentRegister.Cg / 16;
		},
		
		copySubdividedRegisters: function(parentNode, c /* component name */ , cNW, cNE, cSW, cSE) {
			var S = this.subdividedRegisters;

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
	
	function DSNode(owner) {
		this.init(owner);

		// Subdivision registers
		this.rNW = new SubdivisionRegisterSet();
		this.rNE = new SubdivisionRegisterSet();
		this.rSW = new SubdivisionRegisterSet();
		this.rSE = new SubdivisionRegisterSet();
	}
	
	DSNode.prototype = {
		init: function(owner) {
			this.owner = owner;
			
			this.index = -1;
			this.terminated = false;
			this.bounds = null;
		},
		
		calcLighting: (function() {
			var v1 = null;
			var v2 = null;
			var vN = null;
			
			return function(lx, ly, lz) {
				if (!v1){v1 = new Vec4();}
				if (!v2){v2 = new Vec4();}
				if (!vN){vN = new Vec4();}

				var rs1 = this.rNW;
				var rs2 = this.rNE;
				var rs3 = this.rSE;

				v1.x = rs2.x.f - rs1.x.f;
				v1.y = rs2.y.f - rs1.y.f;
				v1.z = rs2.z.f - rs1.z.f;

				v2.x = rs3.x.f - rs2.x.f;
				v2.y = rs3.y.f - rs2.y.f;
				v2.z = rs3.z.f - rs2.z.f;
				
				vN.xp3(v1, v2).normalize3();
				
				v1.x = lx;
				v1.y = ly;
				v1.z = lz;
				return vN.dp3(v1);
			};
		})(),
		
		calcBounds: function(viewport) {
			var xmin = 9999;
			var ymin = 9999;
			var xmax = -9999;
			var ymax = -9999;
			var sx, sy, rs, z = 0;
			
			// written as inline for speed
			
			rs = this.rNW;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
			z += rs.z.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}
			
			rs = this.rNE;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
			z += rs.z.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}

			rs = this.rSW;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
			z += rs.z.f / rs.w.f;
				
			if  (sx > xmax){xmax = sx;}
			if  (sy > ymax){ymax = sy;}
			if  (sx < xmin){xmin = sx;}
			if  (sy < ymin){ymin = sy;}

			rs = this.rSE;
			sx = rs.x.f / rs.w.f;
			sy = rs.y.f / rs.w.f;
			z += rs.z.f / rs.w.f;
				
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
				h: ymin - ymax,
				z: z / 4
			};
			
			return this.bounds;
		},
		
		checkTermination: function() {
			var bd = this.bounds;
			if (bd.w > 1 || bd.h > 1) {
				return false;
			}
			/*
			if (this.countCoveringPoints() >= 2) {
				return false;
			}
*/
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
	
	var activeNodes = [];
	var disposedPool = [];
	function requestNode(owner) {
		if (disposedPool.length > 0) {
			var reusedNode = disposedPool.pop();
			var oldIndex = reusedNode.index;
			activeNodes[oldIndex] = reusedNode;
			reusedNode.init(owner);
			
			reusedNode.index = oldIndex;
			//this.nodes.push(reusedNode);
			
			return reusedNode;
		}
		
		var n = new DSNode(owner);
		n.index = activeNodes.length;
		activeNodes.push(n);
		return n;
	}
		
	function disposeNode(n) {
		if (n == n.owner.root) {n.owner.root = null;}
		n.owner = null;
		activeNodes[n.index] = null;
		disposedPool.push(n);
	}
	
	function clearSubdivisionNodes() {
		var ls = activeNodes;
		var len = ls.length;
		var i;
		for (i = 0;i < len;i++) {
			var nd = ls[i];
			if (nd) {
				disposeNode(nd);
			}
		}
	}
	
	function midp(a, b) {return (a+b)*0.5}
	var _tmpVec4 = null;
	aGlobal.SubdivisionContext = SubdivisionContext;
	aGlobal.DSurface = DSurface;
	aGlobal.clearSubdivisionNodes = clearSubdivisionNodes;
})(window);