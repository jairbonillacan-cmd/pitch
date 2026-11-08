import React from 'react';
import * as Select from '@radix-ui/react-select';
import * as Checkbox from '@radix-ui/react-checkbox';

import './InputSelection.scss'
import './App.scss'
import Button from './Button';
import { withTranslation } from 'react-i18next';

const TYPOGRAPHY_CLASSES = {
  sm: 'text-style-caption-normal',
  md: 'text-style-label-normal',
  lg: 'text-style-label-normal'
}

/**
 * Dropdown trigger takes up the whole available space of its parent who is in turn responsible for its dimensions.
 * Props
 * - type: single|multiple
 * - options: {key: value}
 * - optionGroups: [{label: string, options: {key: value}}]? Optional grouped display for single selections
 * - selection: string|string[]
 * - selectionHandler: fn(selection: string|string[])
 * - typography: sm|md|lg
 * - enabled: true|false
 * - placeholder: string?
 * - name: string?  Optional text to display in front of the selected value to indicate what the input selection is for
 */
class InputSelection extends React.Component {
  constructor(props) {
    super(props);

    this.onSingleValueChange = this.onSingleValueChange.bind(this);
    this.onCheckedValueChange = this.onCheckedValueChange.bind(this);
    this.onOpenChange = this.onOpenChange.bind(this);
    this.apply = this.apply.bind(this);
    this.clear = this.clear.bind(this);

    this.state = {
      open: false,
      selection: this.props.selection,
      lastSelection: this.props.selection
    }
  }

  componentDidUpdate() {
    if (this.props.selection !== this.state.selection && this.props.type === "single") {
      this.setState({selection: this.props.selection, lastSelection: this.props.selection});
    }
  }

  onSingleValueChange(value) {
    this.setState({selection: value}, () => {
      if (this.props.selectionHandler) {
        this.props.selectionHandler(value);
      }
    })
  }

  onCheckedValueChange(checked, value) {
    var selection = this.state.selection;

    if (checked) {
      if (value === 'ALL') {
        selection = [value];
      } else {
        // If a non-all item is checked, remove the 'all' which should always be the first element
        if (selection.length > 0 && selection[0] === 'ALL') {
          selection = selection.slice(1)
        }
        // Using concat instead of push to avoid modifying the original object
        selection = selection.concat(value)

        // All items have been checked, set the 'all' selection
        if (Object.keys(this.props.options).length === selection.length) {
          selection = ['ALL']
        }
      }
    } else {
      if (value === 'ALL') {
        selection = [];
      } else {
        selection = selection.filter(x => x !== value);
      }
    }

    this.setState({selection: selection})
  }

  onOpenChange(open) {
    if (this.props.type === "single") {
      this.setState({open: open})
    } else if (this.props.type === "multiple") {
      this.setState({open: open, selection: this.state.lastSelection})
    }
  }

  apply() {
    this.setState({open: false, lastSelection: this.state.selection})
    this.props.selectionHandler(this.state.selection)
  }

  clear() {
    this.setState({selection: []})
  }

  render() {
    const { t } = this.props;
    var triggerClass = 'input-selection-trigger';
    if (!this.props.enabled) {
      triggerClass += "-disabled";
    } else if (!this.state.selection) {
      // If there is no pre-selected value provided. Mutually exclusive with !enabled
      triggerClass += "-default"
    }

    // Always add the 'all' option for multi-choice input selection without having the parent add it in the options
    var options = this.props.options;
    if (this.props.type === "multiple") {
      options = Object.assign({'ALL': 'ALL'}, options);
    }

    var triggerDisplayText = "";
    if (this.props.name) {
      triggerDisplayText += `${this.props.name}: `
    }
    if (this.state.selection) {
      if (this.props.type === "single") {
        triggerDisplayText += options[this.state.selection];
      } else if (this.props.type === "multiple") {
        triggerDisplayText += this.state.selection.map(x => options[x]).join(", ");
      }
    }
    const renderSingleOption = (key) => (
      <Select.Item key={key} value={key} className='input-selection-dropdown-item'>
        {this.state.selection === key && (<img className='input-selection-dropdown-item-selection-check' src='assets/check.svg' alt="check"/>)}
        <p className={`text-style-label-normal input-selection-dropdown-item-text${this.state.selection === key ? "-selected" : ""}`}>{options[key]}</p>
      </Select.Item>
    );

    return (
      <Select.Root 
        disabled={!this.props.enabled} 
        value={this.state.selection} 
        onValueChange={this.onSingleValueChange} 
        open={this.state.open}
        onOpenChange={this.onOpenChange}
      >
        <Select.Trigger className={`${triggerClass} ${TYPOGRAPHY_CLASSES[this.props.typography]}`}>
          {this.state.selection && (<Select.Value>{triggerDisplayText}</Select.Value>)}
          {!this.state.selection && this.props.placeholder && (<Select.Value placeholder={this.props.placeholder}>{this.props.placeholder}</Select.Value>)}
          <Select.Icon>
            <img className='input-selection-trigger-icon' src="assets/chevron-down.svg" alt="down"/>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className='input-selection-dropdown' position='popper' sideOffset={4}>
            <Select.Viewport>
              {
                this.props.type === "single" && this.props.optionGroups && (
                  this.props.optionGroups.map((group) => (
                    <Select.Group key={group.label}>
                      <Select.Label className='input-selection-dropdown-group-label text-style-caption-uppercase-medium'>
                        {group.label}
                      </Select.Label>
                      {Object.keys(group.options).map(renderSingleOption)}
                    </Select.Group>
                  ))
                )
              }
              {
                this.props.type === "single" && !this.props.optionGroups && (
                  Object.keys(options).map(renderSingleOption)
                )
              }
              {
                this.props.type === "multiple" && (
                  <>
                  {
                    Object.keys(options).map((key) => {
                      const checked = this.state.selection.includes(key);
                      return (
                        <Checkbox.Root className='input-selection-dropdown-item' checked={checked} onCheckedChange={(checked) => this.onCheckedValueChange(checked, key)}>
                          <div className='input-selection-dropdown-item-checkbox-indicator'>
                            {checked && (<img src='assets/check.svg' alt="check"/>)}
                          </div>
                          <p className={`text-style-label-normal input-selection-dropdown-item-text${this.state.selection === key ? "-selected" : ""}`}>{options[key]}</p>
                        </Checkbox.Root>
                      )
                    })
                  }
                    <div className='input-selection-dropdown-button-group'>
                      <div className='input-selection-dropdown-button'>
                        {/* TODO: dark disabled primary is fucked */}
                        <Button text={t("common.actions.apply")} typography="sm" type="primary" enabled={this.state.selection.length > 0} onClick={this.apply}/>
                      </div>
                      <div className='input-selection-dropdown-button'>
                        <Button text={t("web.inputSelection.clear")} typography="sm" type="invisible" enabled={true} onClick={this.clear}/>
                      </div>
                    </div>
                  </>
                )
              }
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    );
  }
}

export default withTranslation()(InputSelection);
