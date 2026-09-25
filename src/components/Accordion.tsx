// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
/* eslint-disable react/prop-types */
import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionActions from '@mui/material/AccordionActions';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Button from '@mui/material/Button';

const GlobalAccordion = ({
  items = [],
  defaultExpandedIndex = null,
  multipleExpand = false, // Allows multiple accordions to be open at once
  onToggle = () => {}, // Callback function when an accordion is toggled
  customClasses = {}, // Custom styles for overriding MUI styles
}) => {
  const [expanded, setExpanded] = useState(multipleExpand ? [] : defaultExpandedIndex);

  const handleToggle = index => {
    if (multipleExpand) {
      setExpanded(prev =>
        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
      );
    } else {
      setExpanded(prev => (prev === index ? null : index));
    }
    onToggle(index);
  };

  return (
    <div className={customClasses.wrapper || 'w-full '}>
      {items.map((item, index) => (
        <Accordion
          key={index}
          expanded={multipleExpand ? expanded.includes(index) : expanded === index}
          onChange={() => handleToggle(index)}
          className={`!bg-black !text-white !rounded-md !border !border-white/14 !px-6 !shadow-sm ${customClasses.accordion || ''}`}
        >
          <AccordionSummary
            expandIcon={
              <ExpandMoreIcon className={`transition-transform duration-300 text-white`} />
            }
            aria-controls={`panel${index}-content`}
            id={`panel${index}-header`}
            className={`hover:text-indigo-400 transition-colors cursor-pointer font-semibold ${customClasses.summary || ''}`}
            onClick={() => item.onClick && item.onClick()}
          >
            <Typography
              component="span"
              className={customClasses.title || 'text-white font-medium'}
            >
              {item.title}
            </Typography>
          </AccordionSummary>
          <AccordionDetails
            className={`transition-all duration-300 ease-in-out text-white/80 leading-relaxed ${customClasses.details || ''}`}
          >
            {typeof item.content === 'string' ? (
              <Typography className="text-white/80">{item.content}</Typography>
            ) : (
              item.content
            )}
          </AccordionDetails>

          {item.actions && (
            <AccordionActions className={customClasses.actions || ''}>
              {item.actions.map((action, actionIndex) => (
                <Button
                  key={actionIndex}
                  onClick={action.onClick}
                  className={customClasses.button || ''}
                >
                  {action.label}
                </Button>
              ))}
            </AccordionActions>
          )}
        </Accordion>
      ))}
    </div>
  );
};

export default GlobalAccordion;
