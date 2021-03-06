/*******************************************************************************
 * Copyright (C) maishu All rights reserved.
 *
 * HTML 页面设计器 
 * 
 * 作者: 寒烟
 * 日期: 2018/5/30
 *
 * 个人博客：   http://www.cnblogs.com/ansiboy/
 * GITHUB:     http://github.com/ansiboy
 * 
 ********************************************************************************/

namespace pdesigner {
    let h = React.createElement;

    export interface ControlProps<T> extends React.Props<T> {
        id?: string,
        componentName?: string,
        className?: string,
        style?: React.CSSProperties,
        name?: string,
        disabled?: boolean;
        onClick?: React.MouseEventHandler<T>,
        onKeyDown?: React.KeyboardEventHandler<T>,
        tabIndex?: number,
    }

    export interface ControlState {
        selected: boolean
    }

    let customControlTypes: { [key: string]: React.ComponentClass<any> | string } = {}

    export interface ElementData {
        type: string;
        props: ControlProps<any>;
        children?: ElementData[],
    }

    let allInstance: { [key: string]: Control<any, any> } = {};

    export abstract class Control<P extends ControlProps<any>, S> extends React.Component<P, S> {
        private originalRef: (e: Control<any, any>) => void;
        private _pageView: PageView;
        private _designer: PageDesigner;
        private originalComponentDidMount: () => void;
        private originalRender: () => React.ReactNode;
        static tabIndex = 1;

        static componentsDir = 'components';
        static selectedClassName = 'control-selected';
        static connectorElementClassName = 'control-container';

        protected hasCSS = false;
        public hasEditor = true;

        abstract element: HTMLElement;

        constructor(props) {
            super(props);

            console.assert((this.props as any).id != null);

            this.originalRender = this.render;
            this.render = Control.render;

            this.originalComponentDidMount = this.componentDidMount;
            this.componentDidMount = this.myComponentDidMount;
            allInstance[this.props.id] = this;
        }

        get id(): string {
            let id = (this.props as any).id;
            console.assert(id);
            return id;
        }

        get componentName() {
            var componentName = this.constructor['componentName'];
            console.assert(componentName != null)
            return componentName;
        }

        static htmlDOMProps(props: any) {
            let result = {};
            if (!props) {
                return result;
            }
            let keys = ['id', 'style', 'className', 'onClick'];
            for (let key in props) {
                if (keys.indexOf(key) >= 0) {
                    result[key] = props[key];
                }
            }
            return result;
        }

        protected async loadControlCSS() {
            let componentName = this.componentName;
            console.assert(componentName != null);
            let path = `${Control.componentsDir}/${componentName}/control`;
            requirejs([`less!${path}`])
        }

        private myComponentDidMount() {
            if (this.originalComponentDidMount)
                this.originalComponentDidMount();

            this._designer.controlComponentDidMount.fire(this._designer, this);

            if (this.hasCSS) {
                this.loadControlCSS();
            }
        }


        private static createDesignTimeElement(type: string | React.ComponentClass<any>, props: ControlProps<any>, ...children) {
            if (props != null && props.id != null)
                props.key = props.id;

            if (this instanceof Control) {
                let control = this;
                console.assert(control._designer != null);

                props = props || {};
                props.onClick = (e) => {
                    control._designer.selectControl(control);
                    e.stopPropagation();
                }

            }

            if (type == 'a' && (props as any).href) {
                (props as any).href = 'javascript:';
            }
            else if (type == 'input') {
                delete props.onClick;
                (props as any).readOnly = true;
            }

            let args = [type, props];
            for (let i = 2; i < arguments.length; i++) {
                args[i] = arguments[i];
            }
            return React.createElement.apply(React, args);
        }

        private static createRuntimeElement(type: string | React.ComponentClass<any>, props: ControlProps<any>, ...children) {
            if (props != null && props.id != null)
                props.key = props.id;

            return React.createElement(type, props, ...children);
        }

        private static render() {
            let self = this as any as Control<any, any>;
            return <DesignerContext.Consumer>
                {context => {
                    self._designer = context.designer;
                    let result =
                        <PageViewContext.Consumer>
                            {context1 => {
                                self._pageView = context1.pageView;
                                if (typeof self.originalRender != 'function')
                                    return null;

                                return context.designer != null ?
                                    (self.originalRender as Function)(Control.createDesignTimeElement.bind(self)) :
                                    (self.originalRender as Function)(Control.createRuntimeElement.bind(self))
                            }}
                        </PageViewContext.Consumer>

                    return result;
                }}
            </DesignerContext.Consumer>
        }

        private static getControlType(componentName: string): Promise<React.ComponentClass<any>> {
            return new Promise<React.ComponentClass<any>>((resolve, reject) => {
                let controlType = customControlTypes[componentName];
                if (typeof controlType != 'string') {
                    resolve(controlType);
                    return;
                }

                let controlPath = controlType;
                requirejs([controlPath],
                    (exports2) => {
                        let controlType: React.ComponentClass = exports2['default'];
                        if (controlType == null)
                            throw new Error(`Default export of file '${controlPath}' is null.`)

                        controlType['componentName'] = componentName;
                        customControlTypes[componentName] = controlType;
                        resolve(controlType);
                    },
                    (err) => reject(err)
                )
            })
        }

        static loadTypes(elementData: ElementData) {
            if (!elementData) throw Errors.argumentNull('elementData');
            let stack = new Array<ElementData>();
            stack.push(elementData);
            let ps = new Array<Promise<any>>();
            while (stack.length > 0) {
                let item = stack.pop();
                let componentName = item.type;
                ps.push(this.getControlType(componentName));

                let children = item.children || [];
                for (let i = 0; i < children.length; i++)
                    stack.push(children[i]);
            }

            return Promise.all(ps);
        }

        static loadAllTypes() {

            let ps = new Array<Promise<any>>();
            for (let key in customControlTypes) {
                if (typeof customControlTypes[key] == 'string') {
                    ps.push(this.getControlType(key));
                }
            }

            return Promise.all(ps);
        }

        static getInstance(id: string) {
            if (!id) throw Errors.argumentNull('id');

            return allInstance[id];
        }

        static create(args: ElementData, designer?: PageDesigner): React.ReactElement<any> {

            let c = customControlTypes[args.type];

            let type: string | React.ComponentClass = args.type;
            let componentName = args.type;
            let controlType = customControlTypes[componentName];
            if (controlType) {
                type = controlType;
            }

            let children = args.children ? args.children.map(o => this.create(o, designer)) : null;

            if (designer) {
                return this.createDesignTimeElement(type, args.props, children);
            }

            return this.createRuntimeElement(type, args.props, children);
        }

        static register(controlType: React.ComponentClass<any>);
        static register(controlName: string, controlType: React.ComponentClass<any>)
        static register(controlName: string, controlPath: string)
        static register(controlName: any, controlType?: React.ComponentClass<any> | string) {
            if (controlType == null && typeof controlName == 'function') {
                controlType = controlName;
                controlName = (controlType as React.ComponentClass<any>).name;
                controlType['componentName'] = controlName;
            }

            if (!controlName)
                throw Errors.argumentNull('controlName');

            if (!controlType)
                throw Errors.argumentNull('controlType');

            customControlTypes[controlName] = controlType;
        }

        private static getComponentNameByType(type: React.ComponentClass<any> | React.StatelessComponent<any>) {
            for (let key in customControlTypes) {
                if (customControlTypes[key] == type)
                    return key;
            }

            return null;
        }

        static export(control: Control<ControlProps<any>, any>) {
            let id = (control.props as any).id;
            console.assert(id != null);

            let name = control.componentName;
            console.assert(name != null);

            let data = Control.trimProps(control.props);
            let childElements: Array<React.ReactElement<any>>;
            if (control.props.children != null) {
                childElements = Array.isArray(control.props.children) ?
                    control.props.children as Array<React.ReactElement<any>> :
                    [control.props.children as React.ReactElement<any>];
            }

            let result: ElementData = { type: name, props: { id } };
            if (!this.isEmptyObject(data)) {
                result.props = data;
            }
            if (childElements) {
                result.children = childElements.map(o => Control.exportElement(o));
            }

            return result;
        }

        private static exportElement(element: React.ReactElement<any>): ElementData {
            let controlType = element.type;
            console.assert(controlType != null, `Element type is null.`);

            let id = element.props.id as string;
            let name = typeof controlType == 'function' ? this.getComponentNameByType(controlType) : controlType;
            let data = Control.trimProps(element.props);

            let childElements: Array<React.ReactElement<any>>;
            if (element.props.children) {
                childElements = Array.isArray(element.props.children) ?
                    element.props.children : [element.props.children];
            }

            let result: ElementData = { type: name, props: { id } };
            if (!this.isEmptyObject(data)) {
                result.props = data;
            }

            if (childElements) {
                result.children = childElements.map(o => this.exportElement(o));
            }
            return result;
        }

        private static trimProps(props: any) {
            let data = {};
            let skipFields = ['id', 'componentName', 'key', 'ref', 'children'];
            for (let key in props) {
                let isSkipField = skipFields.indexOf(key) >= 0;
                if (key[0] == '_' || isSkipField) {
                    continue;
                }
                data[key] = props[key];
            }
            return data;
        }

        private static isEmptyObject(obj) {
            if (obj == null)
                return true;

            let names = Object.getOwnPropertyNames(obj);
            return names.length == 0;
        }
    }

    //==============================================================    
    interface ComponentProp<T> extends React.Props<T> {
        onClick?: (event: MouseEvent, control: T) => void,
        createElement?: (type, props, ...children) => JSX.Element,
    }

    function createDesignTimeElement(type: string | React.ComponentClass<any>, props: ComponentProp<any>, ...children) {
        props = props || {};
        // if (typeof type == 'string')
        //     props.onClick = () => { };
        // else if (typeof type != 'string') {
        //     props.onClick = (event, control: Control<any, any>) => {
        //         if (control.context != null) {
        //             control.context.designer.selecteControl(control, type);
        //         }
        //     }
        // }
        if (type == 'a' && (props as any).href) {
            (props as any).href = 'javascript:';
        }
        else if (type == 'input') {
            delete props.onClick;
            (props as any).readOnly = true;
        }

        let args = [type, props];
        for (let i = 2; i < arguments.length; i++) {
            args[i] = arguments[i];
        }
        return React.createElement.apply(React, args);
    }




}