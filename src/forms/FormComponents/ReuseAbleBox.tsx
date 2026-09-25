import React from 'react';

function ReuseAbleBox({
  Heading,
  Paragraph,
  isSelected,
  onClick,
  className,
  headingStyle = '',
  id,
}) {
  return (
    <div className="">
      <div
        id={id}
        onClick={onClick}
        className={` ${className} w-[250px] p-4 flex flex-col text-wrap  cursor-pointer h-[100px] border-2 rounded-xl transition-all  border-line-soft ${isSelected ? 'border-accent-cyan bg-accent-cyan/5' : 'border-line-soft bg-surface-1'}`}
      >
        <h1 className={`text-text-dark font-bold ${headingStyle}`}>{Heading}</h1>
        {/* <p className="text-text-medium text-sm">{Paragraph}</p> */}
        {Array.isArray(Paragraph) ? (
          <ul className="text-sm text-text-medium list-disc pl-5 space-y-1 mt-2">
            {Paragraph.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-medium">{Paragraph}</p>
        )}
      </div>
    </div>
  );
}

export default ReuseAbleBox;

// import React from 'react';

// function ReuseAbleBox({ Heading, Paragraph, isSelected, onClick, className, headingStyle = '' }) {
//   return (
//     <div>
//       <div
//         onClick={onClick}
//         className={`w-[250px] p-4 flex flex-col cursor-pointer rounded-xl transition-all border-2
//           ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}
//           ${className}`}
//       >
//         {Heading && <h1 className={`text-text-dark font-bold ${headingStyle}`}>{Heading}</h1>}

//         {Array.isArray(Paragraph) ? (
//           <ul className="text-sm text-text-medium list-disc pl-5 space-y-1 mt-2">
//             {Paragraph.map((line, idx) => (
//               <li key={idx}>{line}</li>
//             ))}
//           </ul>
//         ) : (
//           <p className="text-sm text-text-medium mt-2">{Paragraph}</p>
//         )}
//       </div>
//     </div>
//   );
// }

// export default ReuseAbleBox;
